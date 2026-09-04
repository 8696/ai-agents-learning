/**
 * 职责：协议 A 一次性调用 —— 只用 openai SDK，翻译成 UnifiedResponse。
 * 数据流：SendMessageOptions → chat.completions.create(stream:false) → UnifiedResponse。
 * 本文件禁止 import @anthropic-ai/sdk。
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

  logger.info(
    "llm.request.protocolA.once",
    "→ 调用 openai.chat.completions.create(stream:false)",
    "adapter 已分叉到协议 A 一次性分支；完整打请求体便于对照 SDK 文档（model / messages / stream 标记 / 是否带 thinking 字段）",
    {
      protocol: "A",
      mode: "once",
      sdk: "openai",
      model: llm.modelA,
      messagesCount: messages.length,
      stream: false,
      thinkingEnabled: thinkingEnabled(opts),
      __code: JSON.stringify(requestBody, null, 2),
    },
  );

  const r = await llm.openai.chat.completions.create(requestBody);

  logger.info(
    "llm.response.protocolA.once",
    "← got response",
    "完整打响应便于核对 SDK 自带字段（usage / choices / finish_reason），不挑字段",
    r,
  );

  const plain = JSON.parse(JSON.stringify(r));
  const message = (plain.choices?.[0]?.message ?? {}) as ProtocolADelta;
  const { thinking, answer } = extractThinkFromProtocolAMessage(message);
  const u = plain.usage ?? {};

  return {
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
}
