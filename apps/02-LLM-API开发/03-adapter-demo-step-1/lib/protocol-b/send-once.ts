/**
 * 职责：协议 B 一次性调用 —— 只用 @anthropic-ai/sdk，翻译成 UnifiedResponse。
 * 数据流：SendMessageOptions → messages.create → block[] 拆 text/thinking → UnifiedResponse。
 * 本文件禁止 import openai。
 */
import type { Llm } from "../../../../llm.js";
import type { SendMessageOptions, UnifiedResponse } from "../adapter/types.js";
import { thinkingEnabled } from "../adapter/types.js";
import { logger } from "../logger.js";

export async function sendViaB(
  llm: Llm,
  opts: SendMessageOptions,
): Promise<UnifiedResponse> {
  const thinkingOn = thinkingEnabled(opts);
  const thinkingCfg = opts.thinking ?? { type: "enabled" as const, budget_tokens: 1024 };
  const maxTokens = thinkingOn
    ? Math.max(thinkingCfg.budget_tokens + 1024, llm.maxTokensB, 2048)
    : llm.maxTokensB;

  const requestBody = {
    model: llm.modelB,
    system: opts.system,
    max_tokens: maxTokens,
    ...(thinkingOn ? { temperature: 1 as const, thinking: thinkingCfg } : {}),
    messages: [{ role: "user" as const, content: opts.message }],
  };

  logger.info(
    "llm.request.protocolB.once",
    "→ 调用 anthropic.messages.create",
    "adapter 已分叉到协议 B 一次性分支；system / max_tokens / thinking 配比完整打，便于对照 SDK 文档（max_tokens 必须 ≥ budget_tokens+1024 是 SDK 强约束）",
    {
      protocol: "B",
      mode: "once",
      sdk: "anthropic",
      model: llm.modelB,
      hasSystem: Boolean(opts.system),
      maxTokens,
      thinkingEnabled: thinkingOn,
      messagesCount: 1,
      __code: JSON.stringify(requestBody, null, 2),
    },
  );

  const r = await llm.anthropic.messages.create(requestBody);

  logger.info(
    "llm.response.protocolB.once",
    "← got response",
    "完整打响应便于核对 SDK 自带字段（content blocks / stop_reason / usage / cache_read_input_tokens）",
    r,
  );

  const plain = JSON.parse(JSON.stringify(r));
  const blocks: Array<{ type: string; text?: string; thinking?: string }> = plain.content ?? [];
  const textAnswer = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  const thinkingText = blocks
    .filter((b) => b.type === "thinking")
    .map((b) => b.thinking ?? "")
    .join("");
  const u = plain.usage ?? {};

  return {
    content: textAnswer,
    thinking: thinkingText || undefined,
    stopReason: plain.stop_reason ?? "unknown",
    usage: {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
      thinkingTokens: u.output_tokens_details?.thinking_tokens,
      cachedTokens: u.cache_read_input_tokens,
    },
    protocol: "B",
    model: llm.modelB,
  };
}
