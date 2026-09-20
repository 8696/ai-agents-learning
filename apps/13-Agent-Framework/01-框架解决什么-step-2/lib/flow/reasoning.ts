/**
 * 职责：调一次模型，把推理过程拆出来。两种协议共用同一个 streamText 出口。
 *
 * 数据流：query + providerId + protocol → getLlmForProvider → createModel → streamText
 *   → toUIMessageStream → pipeUIMessageStreamToResponse。
 *   OpenAI 协议：minimax 走 extractReasoningMiddleware 拆 <think>...</think>；
 *     zhipu / deepseek / qwen 走 createOpenAICompatible，SDK 内部读 delta.reasoning_content
 *     拆出 reasoning 段（OpenAI 网关扩展字段，@ai-sdk/openai 不读，@ai-sdk/openai-compatible 读）。
 *   Anthropic 协议：@ai-sdk/anthropic 自己把原生 thinking blocks 翻成 reasoning 段；
 *     且 streamText 传 providerOptions.anthropic.thinking = { type:"enabled", budgetTokens }，
 *     并把 maxTokens 抬到 budgetTokens + 1024（Anthropic Messages API 强制 budget < max）。
 *   浏览器对两种协议按同一套规则累加 reasoning-delta / text-delta 两类事件。
 */
import type { ServerResponse } from "node:http";
import {
  pipeUIMessageStreamToResponse,
  streamText,
  toUIMessageStream,
} from "ai";
import {
  type ProductionProviderId,
  getLlmForProvider,
} from "../../../../llm.js";
import { createModel, type Protocol } from "../cafe/model.js";
import { logger } from "../logger.js";

export async function pipeReasoning(
  query: string,
  providerId: ProductionProviderId,
  protocol: Protocol,
  response: ServerResponse,
  abortSignal?: AbortSignal,
): Promise<void> {
  const started = Date.now();
  const llm = getLlmForProvider(providerId);
  if (!llm) {
    throw new Error(`提供商 ${providerId} 没在 apps/.env 配齐 Key / 模型 id。`);
  }
  logger.info("pipeReasoning", "调用函数：pipeReasoning", `provider=${providerId} · protocol=${protocol} · 一次 streamText 把 reasoning 拆出来。`, {});
  logger.info("pipeReasoning", "调用函数：pipeReasoning", "记下这一次的 query + provider + protocol + 模型 id + baseURL。", {
    入参: { query, providerId, protocol, modelA: llm.modelA, baseUrlA: llm.baseUrlA, modelB: llm.modelB, baseUrlB: llm.baseUrlB, maxTokensB: llm.maxTokensB },
  });

  const model = createModel(providerId, protocol);
  const anthropicThinking = protocol === "anthropic"
    ? {
        maxTokens: llm.maxTokensB + 1024,
        providerOptions: {
          anthropic: {
            thinking: { type: "enabled" as const, budgetTokens: llm.maxTokensB },
          },
        },
      }
    : {};
  logger.info("pipeReasoning", "调用函数：pipeReasoning", "函数体：createModel → 拼 anthropicThinking → streamText → toUIMessageStream → 推流。", {
    __code: pipeReasoning.toString(),
  });

  const 入参 = {
    modelProvider: protocol === "openai"
      ? (providerId === "minimax" ? "openai(wrap+extractReasoningMiddleware)" : "openai-compatible(createOpenAICompatible，SDK 内部拆 delta.reasoning_content)")
      : "anthropic(原生 thinking blocks)",
    modelId: protocol === "openai" ? llm.modelA : llm.modelB,
    baseURL: protocol === "openai" ? llm.baseUrlA : `${llm.baseUrlB}/v1/messages`,
    prompt: query,
    ...anthropicThinking,
  };
  logger.info("│ streamText", "调用模型：streamText", `provider=${providerId} · protocol=${protocol} · 真发网络请求发生在 AI SDK 内部。anthropic 这条传 thinking + maxTokens，让原生 thinking 段出来。`, {
    入参,
  });

  const result = streamText({
    model,
    prompt: query,
    abortSignal,
    ...anthropicThinking,
    onError: ({ error }) => {
      logger.error("│ streamText", "结束：streamText（失败）", `protocol=${protocol} · provider=${providerId} · 把 AI SDK 内部异常原文落日志，不让它被包成"An error occurred."。`, {
        返回值: { name: error instanceof Error ? error.name : typeof error, message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined },
      });
    },
    onFinish: ({ text, reasoning, finishReason }) => {
      logger.info("│ streamText", "结束：streamText", `protocol=${protocol} · provider=${providerId}`, {
        耗时ms: Date.now() - started,
        返回值: { text, reasoning, finishReason },
      });
    },
  });
  await pipeUIMessageStreamToResponse({
    response,
    stream: toUIMessageStream({ stream: result.stream }),
  });
  logger.info("pipeReasoning", "结束：pipeReasoning", `protocol=${protocol} · provider=${providerId} 流已写入。`, {
    耗时ms: Date.now() - started,
    返回值: { streamed: true },
  });
}