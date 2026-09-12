/**
 * 职责：按当前提供商给文本算嵌入向量（Embedding）。
 *
 * 来源：自模块 08 第 1 条「RAG 流水线」同一函数（create-embeddings.ts）。
 *       本 demo 必须自带本地副本（§5.3.12 独立性）—— 不能 import 其它 demo 的代码。
 *
 * MiniMax 不是 OpenAI 的 input 格式（用 texts + type=db|query）；
 * 智谱 / 千问走 OpenAI 兼容 embeddings.create，必须显式 encoding_format=float
 *   （OpenAI SDK 默认按 base64 解码，智谱返回小数数组会被解成全 0）。
 *
 * 数据流：单条 query → embedTexts → number[]（与 CORPUS 各卡预嵌入向量比对）
 */
import type { Llm } from "../../../../llm.js";
import { HttpError } from "../http/send-error.js";
import { withCall } from "../http/with-call.js";

export type EmbedKind = "db" | "query";

function joinUrl(base: string, pathName: string): string {
  return `${base.replace(/\/$/, "")}/${pathName.replace(/^\//, "")}`;
}

function parseVectors(raw: unknown): number[][] {
  if (!raw || typeof raw !== "object") {
    throw new HttpError(502, "嵌入接口返回不是对象", "看日志里的完整返回值");
  }
  const body = raw as Record<string, unknown>;
  const baseResp = body.base_resp as { status_code?: number; status_msg?: string } | undefined;
  if (baseResp && baseResp.status_code != null && baseResp.status_code !== 0) {
    throw new HttpError(
      400,
      `嵌入接口失败：${baseResp.status_msg ?? "unknown"}`,
      `status_code=${baseResp.status_code}。MiniMax 要传 texts 和 type，不是 OpenAI 的 input。`,
    );
  }
  if (Array.isArray(body.vectors)) {
    return body.vectors as number[][];
  }
  if (Array.isArray(body.data)) {
    const rows = (body.data as Array<{ index?: number; embedding?: unknown }>)
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return rows.map((row) => asNumberVector(row.embedding));
  }
  throw new HttpError(502, "嵌入接口没有 vectors / data", "看日志完整返回值，对一下字段名");
}

function asNumberVector(embedding: unknown): number[] {
  if (Array.isArray(embedding)) return embedding.map((n) => Number(n));
  if (embedding instanceof Float32Array) return Array.from(embedding);
  return [];
}

function isAllZero(row: number[]): boolean {
  return row.length > 0 && row.every((n) => n === 0);
}

async function embedMiniMax(llm: Llm, texts: string[], kind: EmbedKind): Promise<number[][]> {
  const url = joinUrl(llm.baseUrlA, "embeddings");
  const payload = { model: llm.embeddingModel, texts, type: kind };
  const raw = await withCall({
    scope: "││ 调用HTTP-嵌入",
    kind: "HTTP",
    name: `POST ${url}`,
    explain: kind === "db" ? "建库：MiniMax 用 texts + type=db。" : "提问：MiniMax 用 texts + type=query。",
    args: { url, payload },
    code: "fetch(url, { method: POST, body: { model, texts, type } })",
    run: async () => {
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
        throw new HttpError(response.ok ? 502 : response.status, "嵌入接口返回不是 JSON", text);
      }
      if (!response.ok) {
        throw new HttpError(response.status, "嵌入 HTTP 失败", JSON.stringify(json));
      }
      return json;
    },
  });
  return parseVectors(raw);
}

async function embedOpenAiCompat(llm: Llm, texts: string[]): Promise<number[][]> {
  const payload = {
    model: llm.embeddingModel,
    input: texts,
    encoding_format: "float" as const,
  };
  const response = await withCall({
    scope: "││ 调用模型-嵌入",
    kind: "模型",
    name: "embeddings.create",
    explain: "OpenAI 兼容接口：字段是 input。显式要小数数组，避免 SDK 默认按 base64 解码。真发网络请求。",
    args: payload,
    code: "llm.openai.embeddings.create({ model, input, encoding_format: 'float' })",
    run: () => llm.openai.embeddings.create(payload),
  });
  return parseVectors(response);
}

/**
 * 给单条或多条文本算向量。本 demo 一次只算一条 query（一对查询），不需分批；
 * 多个 query 也可以一次发（省往返），但教学上「一次一个」更直观。
 */
export async function embedTexts(llm: Llm, texts: string[], kind: EmbedKind): Promise<number[][]> {
  if (!llm.embeddingModel) {
    throw new HttpError(
      400,
      "当前提供商没有嵌入模型（Embedding Model）",
      "填 LLM_EMBEDDING_MODEL，或把 LLM_PROVIDER 换成 minimax / zhipu / qwen",
    );
  }
  if (texts.length === 0) return [];

  const vectors = llm.provider === "minimax"
    ? await embedMiniMax(llm, texts, kind)
    : await embedOpenAiCompat(llm, texts);
  validateVectors(vectors, texts.length);
  return vectors;
}

function validateVectors(vectors: number[][], expectedLen: number): void {
  if (vectors.length !== expectedLen) {
    throw new HttpError(
      502,
      `向量条数对不上：${vectors.length} vs ${expectedLen}`,
      "看日志里的完整返回值，对一下 texts 和 vectors",
    );
  }
  if (vectors.some((row) => !Array.isArray(row) || row.length === 0)) {
    throw new HttpError(502, "有一条向量是空的", "看日志里的完整返回值");
  }
  if (vectors.some(isAllZero)) {
    throw new HttpError(
      502,
      "有一条向量全是 0",
      "OpenAI SDK 默认按 base64 解码。智谱返回的是小数数组，会被解成全 0。本步已要求 encoding_format=float；若仍全 0，看日志完整返回值。",
    );
  }
}