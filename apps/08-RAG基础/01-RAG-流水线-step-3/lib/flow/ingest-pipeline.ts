/**
 * 职责：把一份售后 Markdown 拆进库。本步核心是加载（Load）→ 切块（Chunk）→ 向量化（Embed）→ 写入。
 * 提问不再走本文件。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLlm } from "../../../../llm.js";
import { embedPrefixRule, embedTexts } from "../embed/create-embeddings.js";
import { HttpError } from "../http/send-error.js";
import { maskSecret, withCall } from "../log/with-call.js";
import { addChunks, deleteBySource, type ChunkRow } from "../store/vector-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = "refund.md";
const FILE = path.resolve(__dirname, "..", "..", "knowledge", SOURCE);

export type IngestResult = {
  load: { source: string; type: "markdown"; charCount: number; excerpt: string };
  chunks: Array<{ chunkIndex: number; section: string; source: string; text: string }>;
  embed: { model: string; prefixRule: string; vectorCount: number; dimensions: number };
  written: number;
  stepsRan: Array<"load" | "chunk" | "embed" | "write">;
};

function splitDocument(text: string): Array<{ section: string; text: string }> {
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

export async function runIngest(): Promise<IngestResult> {
  const llm = getLlm();
  return withCall({
    scope: "调用函数-runIngest",
    kind: "函数",
    name: "runIngest",
    explain: "0→1 拆库。先加载成长文，再拆成行，最后写入。密钥已打码。",
    args: { source: SOURCE, embeddingModel: llm.embeddingModel, apiKey: maskSecret(llm.apiKey) },
    code: "readFile → split ## → embedTexts(type=db) → deleteBySource(refund.md) → addChunks",
    run: async () => {
      const raw = fs.readFileSync(FILE, "utf8");
      if (!raw.trim()) {
        throw new HttpError(400, "refund.md 是空的", "空正文不能入库");
      }
      const load = {
        source: SOURCE,
        type: "markdown" as const,
        charCount: raw.length,
        excerpt: raw.slice(0, 240),
      };
      const pieces = splitDocument(raw);
      const vectors = await embedTexts(llm, pieces.map((item) => item.text), "db");
      const rows: ChunkRow[] = pieces.map((item, index) => ({
        id: `${SOURCE}#${index}`,
        vector: vectors[index] ?? [],
        text: item.text,
        source: SOURCE,
        section: item.section,
        chunkIndex: index,
      }));
      await deleteBySource(SOURCE);
      const written = await addChunks(rows);
      return {
        load,
        chunks: pieces.map((item, index) => ({
          chunkIndex: index,
          section: item.section,
          source: SOURCE,
          text: item.text,
        })),
        embed: {
          model: llm.embeddingModel,
          prefixRule: embedPrefixRule(llm.provider),
          vectorCount: vectors.length,
          dimensions: vectors[0]?.length ?? 0,
        },
        written,
        stepsRan: ["load", "chunk", "embed", "write"],
      };
    },
  });
}
