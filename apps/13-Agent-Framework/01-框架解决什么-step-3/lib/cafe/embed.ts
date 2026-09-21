/**
 * 职责：按 provider 拼一个能喂 ai.embed / ai.embedMany 的 EmbeddingModel。
 *
 * 数据流：
 *   providerId → getLlmForProvider → createEmbeddingModel(providerId)
 *   → EmbeddingModelV4 实例（来自 SDK 内置 provider 或自定义 doEmbed）
 *   route / flow 拿到后 → ai.embed({ model, value }) 或 ai.embedMany({ model, values })
 *
 * 为什么分两路：
 *   - minimax 的 /v1/embeddings 请求体是 { model, texts: [...], type: "db" }；
 *     AI SDK 7.x 的内置 provider 在嵌入端点强制写 { input: [...] }，改不了字段名；
 *     所以 minimax 走自定义 doEmbed，自己 fetch provider 原生协议。
 *   - zhipu / qwen / OpenAI 原生：请求体就是 { model, input: [...] }，
 *     跟 AI SDK 内置 OpenAI 兼容 provider 的默认行为一致；
 *     所以直接用 @ai-sdk/openai-compatible 的 textEmbeddingModel，让 SDK 走内置协议层。
 *
 * 对照 lib/cafe/model.ts：那条是 chat 模型的拼装链（createOpenAI + middleware / createAnthropic）；
 *   这条是 embedding 模型的拼装链（按 providerId 决定走 SDK 内置 provider 还是自写 doEmbed）。
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModel } from "ai";
import { type ProductionProviderId, getLlmForProvider } from "../../../../llm.js";
import { logger } from "../logger.js";

/**
 * minimax 自定义 doEmbed（因为 minimax 协议字段是 texts + type:"db"，AI SDK 内置 provider 不支持）。
 */
async function doEmbedMinimax(values: string[], abortSignal?: AbortSignal): Promise<{ embeddings: number[][]; tokens: number }> {
  const llm = getLlmForProvider("minimax");
  if (!llm || !llm.embeddingModel) throw new Error("minimax 没在 apps/.env 配齐 Key / embedding 模型 id。");

  const url = `${llm.baseUrlA.replace(/\/+$/, "")}/embeddings`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${llm.apiKey}`,
  };
  const body = { model: llm.embeddingModel, texts: values, type: "db" };

  logger.info("│ doEmbedMinimax", "调用模型：fetch", `provider=minimax · model=${llm.embeddingModel} · body 字段 texts + type:"db" · 真发网络请求到 ${url}。`, {
    入参: { providerId: "minimax", model: llm.embeddingModel, url, body, headers: { ...headers, Authorization: "Bearer ***" } },
  });

  const started = Date.now();
  const res = await fetch(url, { method: "POST", headers: headers, body: JSON.stringify(body), signal: abortSignal });
  const raw = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(raw); } catch (_) { throw new Error(`${url} 返回非 JSON（HTTP ${res.status}）：${raw.slice(0, 200)}`); }
  if (!res.ok) {
    const errMsg = (json.error as { message?: string } | undefined)?.message || raw.slice(0, 200);
    throw new Error(`${url} HTTP ${res.status}：${errMsg}`);
  }
  const baseResp = json.base_resp as { status_code?: number; status_msg?: string } | undefined;
  if (baseResp && baseResp.status_code && baseResp.status_code !== 0) {
    throw new Error(`minimax 业务错误 ${baseResp.status_code}：${baseResp.status_msg || "未知"}`);
  }
  const vectors = (json.vectors as number[][] | undefined) ?? [];
  if (vectors.length !== values.length) {
    throw new Error(`minimax 返回 ${vectors.length} 条向量，与请求 ${values.length} 条不匹配`);
  }
  const tokens = Number((json.total_tokens as number | undefined) ?? 0);
  logger.info("│ doEmbedMinimax", "结束：fetch", `${vectors.length} 条向量已一次性拿到；维度 ${vectors[0]?.length ?? 0}；token ${tokens}；耗时 ${Date.now() - started} ms。`, {
    耗时ms: Date.now() - started,
    返回值: { count: vectors.length, dim: vectors[0]?.length ?? 0, tokens },
  });
  return { embeddings: vectors, tokens };
}

/**
 * 按 provider 拼 EmbeddingModel。
 *   - minimax：自写 doEmbed（body 字段是 texts + type:"db"，AI SDK 内置 provider 不支持）。
 *   - zhipu / qwen：直接 createOpenAICompatible({ baseURL }).textEmbeddingModel(modelId)，
 *     让 AI SDK 走内置 OpenAI 兼容协议层（默认 body 字段 input / encoding_format: "float"）。
 *   - deepseek：defaultEmbed 为空，抛 400，不发请求。
 */
export function createEmbeddingModel(providerId: ProductionProviderId): EmbeddingModel {
  const llm = getLlmForProvider(providerId);
  if (!llm) throw new Error(`提供商 ${providerId} 没在 apps/.env 配齐 Key / 模型 id。`);
  if (!llm.embeddingModel) throw new Error(`提供商 ${providerId} 没在 apps/.env 配 embedding 模型 id。`);

  if (providerId === "minimax") {
    logger.info("createEmbeddingModel", "调用函数：createEmbeddingModel", "minimax 协议字段（texts + type:\"db\"）AI SDK 内置 OpenAI provider 不支持 → 自写 EmbeddingModelV4（自带 doEmbed）。", {
      入参: { providerId, modelId: llm.embeddingModel, baseURL: llm.baseUrlA },
    });
    const fakeModel = {
      specificationVersion: "v4" as const,
      modelId: llm.embeddingModel,
      provider: providerId,
      maxEmbeddingsPerCall: 2048,
      supportsParallelCalls: true,
      doEmbed: async function (args: { values: string[]; abortSignal?: AbortSignal }) {
        const result = await doEmbedMinimax(args.values, args.abortSignal);
        return { embeddings: result.embeddings, usage: { tokens: result.tokens } };
      },
    };
    return fakeModel as unknown as EmbeddingModel;
  }

  // zhipu / qwen：走 AI SDK 内置 OpenAI 兼容 provider。
  // createOpenAICompatible({ baseURL }).embeddingModel(modelId) 返回的是 SDK 内置 EmbeddingModelV4，
  // 它默认发 { model, input: [...], encoding_format: "float" } 到 ${baseURL}/embeddings，
  // 跟 zhipu / qwen 的 OpenAI 兼容协议一致。
  const provider = createOpenAICompatible({
    name: llm.provider,
    apiKey: llm.apiKey,
    baseURL: llm.baseUrlA,
  });
  const model = provider.embeddingModel(llm.embeddingModel);
  logger.info("createEmbeddingModel", "调用函数：createEmbeddingModel", "AI SDK 内置 OpenAI 兼容 provider → textEmbeddingModel(modelId) → 嵌入请求由 SDK 内部发，body 默认 input 字段。", {
    入参: { providerId, modelId: llm.embeddingModel, baseURL: llm.baseUrlA, sdk: "@ai-sdk/openai-compatible.textEmbeddingModel" },
  });
  return model;
}
