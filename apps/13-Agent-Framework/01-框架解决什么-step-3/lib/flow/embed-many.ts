/**
 * 职责：调一次嵌入模型，把多段文字批量转成向量数组（走 AI SDK 的 ai.embedMany）。
 *
 * 数据流：texts[] + providerId → createEmbeddingModel → embedMany({ model, values })
 *   → result.embeddings (number[][]) + result.usage.tokens → JSON 写回浏览器。
 *
 * 为什么用 ai.embedMany：
 *   ai.embedMany 是 AI SDK 7.x 的标准批量嵌入入口；调用后会自动调 doEmbed（多次或单次
 *   由 maxEmbeddingsPerCall / maxParallelCalls 决定）、聚合 token 用量、暴露 abortSignal。
 *   我们只负责实现 doEmbed（在 lib/cafe/embed.ts 里用 customProvider），不重复写协议层循环。
 *
 * 对照 lib/flow/embed.ts：那条用 embed({ value }) 一次一条；这条用 embedMany({ values })
 *   一次多条。同一份 customProvider 模型实例都能喂。
 */
import type { ServerResponse } from "node:http";
import { embedMany } from "ai";
import { type ProductionProviderId, getLlmForProvider } from "../../../../llm.js";
import { createEmbeddingModel } from "../cafe/embed.js";
import { logger } from "../logger.js";

export interface RunEmbedManyArgs {
  providerId: ProductionProviderId;
  texts: string[];
  response: ServerResponse;
  abortSignal?: AbortSignal;
}

export async function runEmbedMany(args: RunEmbedManyArgs): Promise<void> {
  const { providerId, texts, response, abortSignal } = args;
  const started = Date.now();

  logger.info("runEmbedMany", "调用函数：runEmbedMany", "入口：providerId + texts[] → ai.embedMany({ model, values })。批量 → 二维向量数组 + 聚合 token。", {
    字段释义: {
      providerId: "4 家生产环境 provider id",
      texts: "待嵌入的字符串数组（每条都会被转成同维度的向量）",
    },
    入参: { providerId, count: texts.length, firstTextLen: texts[0]?.length ?? 0 },
  });

  const llm = getLlmForProvider(providerId);
  if (!llm) {
    const msg = `提供商 ${providerId} 没在 apps/.env 配齐 Key / 模型 id。`;
    logger.error("runEmbedMany", "结束：runEmbedMany（失败）", msg, { 返回值: { message: msg } });
    if (!response.headersSent) {
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }
  if (!llm.embeddingModel) {
    const msg = `提供商 ${providerId} 没在 apps/.env 配 embedding 模型 id。`;
    logger.error("runEmbedMany", "结束：runEmbedMany（失败）", msg, { 返回值: { message: msg } });
    if (!response.headersSent) {
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }

  const model = createEmbeddingModel(providerId);
  logger.info("runEmbedMany", "调用函数：runEmbedMany", "函数体：createEmbeddingModel → ai.embedMany({ model, values, abortSignal }) → 拆 result.embeddings + result.usage → JSON 写 res。", {
    __code: runEmbedMany.toString(),
  });
  logger.info("│ ai.embedMany", "调用模型：ai.embedMany", `provider=${providerId} · 走到 lib/cafe/embed.ts 里的 customProvider.doEmbed；批量 ${texts.length} 条一次发出；AI SDK 内部按 maxEmbeddingsPerCall 拆批并发。`, {
    入参: { providerId, model: `${providerId}-embed`, count: texts.length, values: texts },
  });

  try {
    const result = await embedMany({ model: model, values: texts, abortSignal });
    const embeddings = result.embeddings;
    const usage = result.usage;
    const dim = embeddings[0]?.length ?? 0;
    const elapsedMs = Date.now() - started;
    logger.info("│ ai.embedMany", "结束：ai.embedMany", `${embeddings.length} 条向量已一次性拿到；维度 ${dim}；token ${usage.tokens}；耗时 ${elapsedMs} ms。`, {
      耗时ms: elapsedMs,
      字段释义: {
        embeddings: "二维浮点数组；每条子数组维度相同",
        "usage.tokens": "整批的聚合 token 用量",
      },
      返回值: { count: embeddings.length, dim: dim, usage: usage },
    });
    if (!response.headersSent) {
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({
        ok: true,
        provider: providerId,
        embeddingModel: llm.embeddingModel,
        dim: dim,
        count: embeddings.length,
        embeddings: embeddings,
        usage: usage,
        elapsedMs: elapsedMs,
      }));
    }
    logger.info("runEmbedMany", "结束：runEmbedMany", "JSON 已写回浏览器。", {
      耗时ms: elapsedMs,
      返回值: { ok: true, count: embeddings.length, dim: dim },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("│ ai.embedMany", "结束：ai.embedMany（失败）", "ai.embedMany 抛错；把原文回浏览器。", { 返回值: { message } });
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