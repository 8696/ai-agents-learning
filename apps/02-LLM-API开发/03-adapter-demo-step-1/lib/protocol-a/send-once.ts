/**
 * 职责：协议 A 一次性调用 —— 只用 openai SDK，翻译成 UnifiedResponse。
 * 数据流：SendMessageOptions → chat.completions.create(stream:false) → UnifiedResponse。
 * 本文件禁止 import @anthropic-ai/sdk。
 *
 * 日志（§5.3.16）：调用函数 五件套（sendViaA 封装层），调用模型 五件套（出网层，含 __code + 字段释义）。
 */
import type { Llm } from "../../../../llm.js";
import type { SendMessageOptions, UnifiedResponse } from "../adapter/types.js";
import { thinkingEnabled } from "../adapter/types.js";
import {
  extractThinkFromProtocolAMessage,
  PROTOCOL_A_THINKING,
  type ProtocolADelta,
} from "./think-extract.js";
import { logger } from "../logger.js";

export async function sendViaA(
  llm: Llm,
  opts: SendMessageOptions,
): Promise<UnifiedResponse> {
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.message });

  const requestBody = {
    model: llm.modelA,
    messages,
    stream: false as const,
    ...(thinkingEnabled(opts) ? PROTOCOL_A_THINKING : {}),
  };

  const tFuncStart = Date.now();
  logger.info(
    "│ 协议A-sendViaA",
    "调用函数开始：sendViaA",
    "为什么打：sendMessage 只认这一层返回的 UnifiedResponse；里面那次才是出网（看「调用模型开始：协议A-对话补全」）。当前：即将发协议 A 一次性调用；system 进 messages[0]。",
    {
      入参: { protocol: "A", mode: "once", sdk: "openai", systemLen: (opts.system ?? "").length, messageLen: opts.message.length, thinkingEnabled: thinkingEnabled(opts) },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(requestBody, null, 2)});`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    "为什么打：本文件唯一的真出网层；不打就没有 usage / finish_reason。当前：即将发出 stream:false 请求；adapter 已分叉到协议 A。",
    {
      入参: {
        model: requestBody.model,
        messagesCount: requestBody.messages.length,
        stream: requestBody.stream,
        thinkingEnabled: thinkingEnabled(opts),
      },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(requestBody, null, 2)});`,
    },
  );

  let r;
  try {
    r = await llm.openai.chat.completions.create(requestBody);
    logger.info(
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全",
      "为什么打：要拿 choices[0].finish_reason / usage（计费依据），还要拿 usage.completion_tokens_details.reasoning_tokens（thinking 计费用）。当前：await 已返回。",
      {
        返回值: {
          id: r.id,
          model: r.model,
          choicesCount: r.choices?.length ?? 0,
          finishReason: r.choices?.[0]?.finish_reason,
          usage: r.usage,
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          "choices[0].finish_reason": "stop=正常 / length=撞 max_tokens / content_filter=策略拦下",
          "usage.completion_tokens_details.reasoning_tokens": "thinking 单独计费的 Token 数（adapter 翻译成 unified.usage.thinkingTokens）",
          "usage.prompt_tokens_details.cached_tokens": "命中 prompt cache 的 Token 数（adapter 翻译成 unified.usage.cachedTokens）",
        },
      },
    );
  } catch (error: unknown) {
    logger.error(
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全（失败）",
      "为什么打：拿到 upstreamStatus 才能区分 401/403（Key）、429（限流）、5xx。当前：create 抛错，sendMessage 的 catch 会把错误向上传。",
      {
        返回值: { message: error instanceof Error ? error.message : String(error) },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    throw error;
  }

  const plain = JSON.parse(JSON.stringify(r));
  const message = (plain.choices?.[0]?.message ?? {}) as ProtocolADelta;
  const { thinking, answer } = extractThinkFromProtocolAMessage(message);
  const u = plain.usage ?? {};

  const unified: UnifiedResponse = {
    content: answer,
    thinking,
    stopReason: plain.choices?.[0]?.finish_reason ?? "unknown",
    usage: {
      inputTokens: u.prompt_tokens ?? 0,
      outputTokens: u.completion_tokens ?? 0,
      totalTokens: u.total_tokens ?? (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0),
      thinkingTokens: u.completion_tokens_details?.reasoning_tokens,
      cachedTokens: u.prompt_tokens_details?.cached_tokens,
    },
    protocol: "A",
    model: llm.modelA,
  };
  logger.info(
    "│ 协议A-sendViaA",
    "调用函数结束：sendViaA",
    "为什么打：sendMessage 要把 UnifiedResponse 向上传；打返回值便于核对「两协议字段差异在 adapter 已经被抹平」。当前：已完成 protocol-specific → unified 翻译。",
    {
      返回值: {
        protocol: unified.protocol,
        model: unified.model,
        stopReason: unified.stopReason,
        usage: unified.usage,
        contentLen: unified.content.length,
        hasThinking: Boolean(unified.thinking),
      },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  return unified;
}