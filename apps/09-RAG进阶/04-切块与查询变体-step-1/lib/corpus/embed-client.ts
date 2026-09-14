/**
 * 职责：按当前提供商调嵌入（Embedding）接口，返回 number[][]（按输入顺序对齐）。
 * 提供商分支：
 *   · MiniMax 走自己协议：POST { baseURL }/embeddings，字段 { model, texts, type }，
 *     返回 { vectors: number[][], base_resp: { status_code, status_msg } }
 *   · 智谱 / 千问 / DeepSeek 走 OpenAI 兼容：embeddings.create({ model, input, encoding_format: "float" })，
 *     返回 { data: [{ index, embedding }], usage }
 *
 * 为什么单独成文件：buildIndex（建库）和 scoreChildren（检索）都要调嵌入接口，
 *                   共享一个 client 避免字段名 / 返回结构重复写。
 *
 * 对照：apps/08-RAG基础/01-RAG-流水线-step-3/lib/embed/create-embeddings.ts 的写法。
 */
import type { Llm } from "../../../../llm.js";

async function embedMiniMax(llm: Llm, texts: string[]): Promise<number[][]> {
  const url = `${llm.baseUrlA.replace(/\/$/, "")}/embeddings`;
  const payload = { model: llm.embeddingModel, texts, type: "db" as const };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${llm.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `MiniMax 嵌入接口返回不是 JSON：HTTP ${response.status}，正文：${text.slice(0, 200)}`,
    );
  }
  const body = json as {
    vectors?: unknown;
    base_resp?: { status_code?: number; status_msg?: string };
  };
  const br = body.base_resp;
  if (br && br.status_code != null && br.status_code !== 0) {
    throw new Error(`MiniMax 嵌入失败：status_code=${br.status_code}，${br.status_msg ?? "unknown"}`);
  }
  if (!Array.isArray(body.vectors)) {
    throw new Error(`MiniMax 嵌入返回没有 vectors 字段：HTTP ${response.status}`);
  }
  return body.vectors as number[][];
}

async function embedOpenAiCompat(llm: Llm, texts: string[]): Promise<number[][]> {
  const response = await llm.openai.embeddings.create({
    model: llm.embeddingModel,
    input: texts,
    encoding_format: "float",
  });
  const data = response.data;
  if (!Array.isArray(data)) {
    throw new Error("OpenAI 兼容嵌入返回没有 data 字段");
  }
  return data
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((row) => (Array.isArray(row.embedding) ? row.embedding.map(Number) : []));
}

export async function fetchEmbeddings(llm: Llm, texts: string[]): Promise<number[][]> {
  if (llm.provider === "minimax") {
    return embedMiniMax(llm, texts);
  }
  return embedOpenAiCompat(llm, texts);
}

/** 工具：取一批向量的平均维度（建库成功后用来看一眼每条多长）。 */
export function vectorDim(vectors: number[][]): number {
  return vectors.find((v) => Array.isArray(v) && v.length > 0)?.length ?? 0;
}