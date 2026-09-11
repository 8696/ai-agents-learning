/**
 * 职责：上传文件（Markdown 或 PDF）后走加载→切块→向量化→写入。
 * 与 runIngest 的区别：文件内容由调用方传入，不读 knowledge/ 目录。
 * 支持 Markdown（按 ## 标题分段）和 PDF（按 3000 字分 chunk）。
 * 走 overwriteChunks（整表清空再写）。
 */
import { getLlm } from "../../../../llm.js";
import { embedPrefixRule, embedTexts } from "../embed/create-embeddings.js";
import { HttpError } from "../http/send-error.js";
import { maskSecret, withCall } from "../log/with-call.js";
import { overwriteChunks, type ChunkRow } from "../store/vector-store.js";

export type IngestUploadResult =
  | {
      source: string;
      type: "markdown";
      charCount: number;
      excerpt: string;
      chunkCount: number;
      sections: Array<{ section: string; text: string }>;
      embed: { model: string; prefixRule: string; vectorCount: number; dimensions: number };
      written: number;
      stepsRan: Array<"load" | "chunk" | "embed" | "write">;
    }
  | {
      source: string;
      type: "pdf";
      charCount: number;
      excerpt: string;
      chunkCount: number;
      pageCount: number;
      pages: Array<{ page: number; charCount: number; excerpt: string }>;
      embed: { model: string; prefixRule: string; vectorCount: number; dimensions: number };
      written: number;
      stepsRan: Array<"load" | "chunk" | "embed" | "write">;
    };

function splitMarkdown(text: string): Array<{ section: string; text: string }> {
  const parts = text.split(/^## /m);
  const out: Array<{ section: string; text: string }> = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const nl = trimmed.indexOf("\n");
    const title = nl === -1 ? trimmed : trimmed.slice(0, nl).trim();
    const body = nl === -1 ? trimmed : trimmed.slice(nl).trim();
    if (!body) continue;
    out.push({ section: title.replace(/^#\s*/, ""), text: `${title}\n${body}` });
  }
  return out;
}

async function loadPdf(
  buffer: Buffer,
): Promise<{ pages: Array<{ page: number; charCount: number; excerpt: string }>; chunks: string[]; totalChars: number; pageCount: number }> {
  // 每 3000 字 = 一个 chunk，不管页码。代价：跨页段落会从中间切断。
  const MAX_CHUNK_CHARS = 3000;

  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();

  if (!result.text.trim()) {
    throw new HttpError(
      400,
      "PDF 抽文本为空",
      "这份 PDF 可能是扫描版（全是图片），正文抽不出来，不能入库",
    );
  }

  function cleanText(raw: string): string {
    return raw
      .replace(/[\x00-\x08\x0b\x0c\x00-\x1f]/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
  }

  const cleaned = cleanText(result.text);
  const totalChars = cleaned.length;

  // 按 3000 字分 chunk：纯字数切，不管页码
  const chunks: string[] = [];
  for (let i = 0; i < cleaned.length; i += MAX_CHUNK_CHARS) {
    chunks.push(cleaned.slice(i, i + MAX_CHUNK_CHARS));
  }

  // 页信息仅作展示用，不参与切块
  const rawParts = result.text.split(/\f/);
  const pages = rawParts
    .map((t, i) => {
      const c = cleanText(t);
      return { page: i + 1, charCount: c.length, excerpt: c.slice(0, 80) };
    })
    .filter((p) => p.charCount > 0);
  const pageCount = pages.length;

  if (chunks.length === 0) {
    throw new HttpError(400, "PDF 解析后无有效文本", "正文为空，不能入库");
  }

  return { pages, chunks, totalChars, pageCount };
}

export async function runIngestUpload(
  filename: string,
  buffer: Buffer,
  fileType: "markdown" | "pdf",
): Promise<IngestUploadResult> {
  const llm = getLlm();

  return withCall({
    scope: "调用函数-runIngestUpload",
    kind: "函数",
    name: "runIngestUpload",
    explain: "上传文件入库（Markdown 或 PDF）。走加载→切块→向量化→写入四步。",
    args: {
      source: filename,
      fileType,
      bufferSize: buffer.length,
      embeddingModel: llm.embeddingModel,
      apiKey: maskSecret(llm.apiKey),
    },
    code: "加载 → 切块（Markdown 按 ## / PDF 按 3000 字）→ embedTexts(type=db) → overwriteChunks",
    run: async () => {
      if (fileType === "markdown") {
        const raw = buffer.toString("utf8");
        if (!raw.trim()) {
          throw new HttpError(400, "文件是空的", "空正文不能入库");
        }
        const pieces = splitMarkdown(raw);
        if (pieces.length === 0) {
          throw new HttpError(400, "Markdown 无法切块", "没有 ## 标题，无法切块入库");
        }
        const vectors = await embedTexts(llm, pieces.map((item) => item.text), "db");
        const rows: ChunkRow[] = pieces.map((item, index) => ({
          id: `${filename}#${index}`,
          vector: vectors[index] ?? [],
          text: item.text,
          source: filename,
          section: item.section,
          chunkIndex: index,
        }));
        const written = await overwriteChunks(rows);
        return {
          source: filename,
          type: "markdown" as const,
          charCount: raw.length,
          excerpt: raw.slice(0, 240),
          chunkCount: pieces.length,
          sections: pieces,
          embed: {
            model: llm.embeddingModel,
            prefixRule: embedPrefixRule(llm.provider),
            vectorCount: vectors.length,
            dimensions: vectors[0]?.length ?? 0,
          },
          written,
          stepsRan: ["load", "chunk", "embed", "write"],
        };
      } else {
        const { pages, totalChars, pageCount, chunks } = await loadPdf(buffer);
        const vectors = await embedTexts(llm, chunks, "db");
        const rows: ChunkRow[] = chunks.map((text, index) => ({
          id: `${filename}#${index}`,
          vector: vectors[index] ?? [],
          text,
          source: filename,
          section: `chunk ${index + 1}（每 3000 字一段）`,
          chunkIndex: index,
        }));
        const written = await overwriteChunks(rows);
        return {
          source: filename,
          type: "pdf" as const,
          charCount: totalChars,
          excerpt: chunks[0]?.slice(0, 240) ?? "",
          chunkCount: chunks.length,
          pageCount,
          pages,
          embed: {
            model: llm.embeddingModel,
            prefixRule: embedPrefixRule(llm.provider),
            vectorCount: vectors.length,
            dimensions: vectors[0]?.length ?? 0,
          },
          written,
          stepsRan: ["load", "chunk", "embed", "write"],
        };
      }
    },
  });
}