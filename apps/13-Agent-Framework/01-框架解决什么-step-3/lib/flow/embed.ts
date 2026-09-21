/**
 * 职责：调一次嵌入模型，把一段文字转成一条向量（走 AI SDK 的 ai.embed）。
 *
 * 数据流：text + providerId → createEmbeddingModel → embed({ model, value })
 *   → result.embedding (number[]) + result.usage.tokens → JSON 写回浏览器。
 *
 * 为什么用 ai.embed：
 *   ai.embed 是 AI SDK 7.x 的标准单条嵌入入口；调用 ai.embed 后会自动调 doEmbed、
 *   聚合 token 用量、暴露 abortSignal 与 providerOptions。我们只负责实现 doEmbed
 *   （在 lib/cafe/embed.ts 里用 customProvider），不重复写协议层循环。
 *
 * 对照 lib/flow/generate-vs-stream.ts：那条用 generateText 把 prompt 一次性变文本；这条用
 *   embed 把 value 一次性变向量。两者都是 AI SDK 的非流式入口，区别是输出类型不同。
 */
import type { ServerResponse } from "node:http";
import { embed } from "ai";
import { type ProductionProviderId, getLlmForProvider } from "../../../../llm.js";
import { createEmbeddingModel } from "../cafe/embed.js";
import { logger } from "../logger.js";

export interface RunEmbedArgs {
  providerId: ProductionProviderId;
  text: string;
  response: ServerResponse;
  abortSignal?: AbortSignal;
}

export async function runEmbed(args: RunEmbedArgs): Promise<void> {
  const { providerId, text, response, abortSignal } = args;
  const started = Date.now();

  logger.info("runEmbed", "调用函数：runEmbed", "入口：providerId + text → ai.embed({ model, value })。单条 → 单个向量 + token 用量。", {
    字段释义: {
      providerId: "4 家生产环境 provider id（minimax | zhipu | deepseek | qwen）",
      text: "待嵌入的字符串",
    },
    入参: { providerId, textLen: text.length },
  });

  const llm = getLlmForProvider(providerId);
  if (!llm) {
    const msg = `提供商 ${providerId} 没在 apps/.env 配齐 Key / 模型 id。`;
    logger.error("runEmbed", "结束：runEmbed（失败）", msg, { 返回值: { message: msg } });
    if (!response.headersSent) {
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }
  if (!llm.embeddingModel) {
    const msg = `提供商 ${providerId} 没在 apps/.env 配 embedding 模型 id。`;
    logger.error("runEmbed", "结束：runEmbed（失败）", msg, { 返回值: { message: msg } });
    if (!response.headersSent) {
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }

  const model = createEmbeddingModel(providerId);
  logger.info("runEmbed", "调用函数：runEmbed", "函数体：createEmbeddingModel → ai.embed({ model, value, abortSignal }) → 拆 result.embedding + result.usage → JSON 写 res。", {
    __code: runEmbed.toString(),
  });
  logger.info("│ ai.embed", "调用模型：ai.embed", `provider=${providerId} · 走到 lib/cafe/embed.ts 里的 customProvider.doEmbed；真发网络请求发生在那里。`, {
    入参: { providerId, model: `${providerId}-embed`, value: text },
  });

  try {
    const result = await embed({ model: model, value: text, abortSignal });
    const embedding = result.embedding;
    const usage = result.usage;
    const elapsedMs = Date.now() - started;
    logger.info("│ ai.embed", "结束：ai.embed", `完整向量已一次性拿到；维度 ${embedding.length}；耗时 ${elapsedMs} ms。`, {
      耗时ms: elapsedMs,
      字段释义: {
        embedding: "浮点数组；维度由模型决定（minimax embo-01 = 1536；zhipu embedding-3 = 1024；qwen text-embedding-v3 = 1024）",
        "usage.tokens": "本次调用的 token 用量（嵌入模型按 token 计费）",
      },
      返回值: { dim: embedding.length, usage: usage },
    });
    if (!response.headersSent) {
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({
        ok: true,
        provider: providerId,
        embeddingModel: llm.embeddingModel,
        dim: embedding.length,
        embedding: embedding,
        usage: usage,
        elapsedMs: elapsedMs,
      }));
    }
    logger.info("runEmbed", "结束：runEmbed", "JSON 已写回浏览器。", {
      耗时ms: elapsedMs,
      返回值: { ok: true, dim: embedding.length },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("│ ai.embed", "结束：ai.embed（失败）", "ai.embed 抛错；把原文回浏览器。", { 返回值: { message } });
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: message }));
    } else {
      response.end();
    }
    throw error;
  }
}