/**
 * 职责：协议 A 流式调用 —— openai 异步迭代器 → UnifiedDelta。
 * 数据流：stream:true + include_usage → splitProtocolADelta → yield thinking/content/usage/done。
 * 本文件禁止 import @anthropic-ai/sdk。
 */
import type { Llm } from "../../../../llm.js";
import type { SendMessageOptions, UnifiedDelta } from "../adapter/types.js";
import { thinkingEnabled } from "../adapter/types.js";
import {
  PROTOCOL_A_THINKING,
  splitProtocolADelta,
  type ProtocolADelta,
} from "./think-extract.js";
import { logger } from "../logger.js";

export async function* sendViaAStream(
  llm: Llm,
  opts: SendMessageOptions,
): AsyncGenerator<UnifiedDelta> {
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.message });

  const requestBody = {
    model: llm.modelA,
    messages,
    stream: true as const,
    stream_options: { include_usage: true },
    ...(thinkingEnabled(opts) ? PROTOCOL_A_THINKING : {}),
  };

  logger.info(
    "llm.request.protocolA.stream",
    "→ 调用 openai.chat.completions.create(stream:true)",
    "adapter 已分叉到协议 A 流式分支；含 stream_options.include_usage=true 以拿到末尾 usage 块",
    {
      protocol: "A",
      mode: "stream",
      sdk: "openai",
      model: llm.modelA,
      messagesCount: messages.length,
      stream: true,
      includeUsage: true,
      thinkingEnabled: thinkingEnabled(opts),
      __code: JSON.stringify(requestBody, null, 2),
    },
  );

  const stream = await llm.openai.chat.completions.create(requestBody);

  logger.info(
    "llm.response.protocolA.stream",
    "← got stream handle",
    "拿到 AsyncIterable 流句柄（不是最终响应）；后续逐 chunk 解析，最后由末尾 usage 块汇总给前端",
    {
      protocol: "A",
      mode: "stream",
      streamType: "AsyncIterable<ChatCompletionChunk>",
    },
  );

  const state = { inThink: false, reasoningSeen: "" };
  let usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
    prompt_tokens_details?: { cached_tokens?: number };
  } | null = null;
  let stopReason = "unknown";

  for await (const chunk of stream) {
    const plain = JSON.parse(JSON.stringify(chunk));
    const delta = (plain.choices?.[0]?.delta ?? {}) as ProtocolADelta;
    const finishReason = plain.choices?.[0]?.finish_reason;
    if (plain.usage) usage = plain.usage;
    if (finishReason) stopReason = finishReason;

    const split = splitProtocolADelta(delta, state);
    if (split.thinking) yield { type: "thinking", text: split.thinking };
    if (split.content) yield { type: "content", text: split.content };
  }

  if (usage) {
    logger.info(
      "llm.response.protocolA.stream.usage",
      "← got usage chunk",
      "末尾 usage 块（include_usage=true 才会有）；完整打便于核对 prompt_tokens / completion_tokens / cached_tokens",
      usage,
    );
    yield {
      type: "usage",
      usage: {
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
        totalTokens:
          usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
        thinkingTokens: usage.completion_tokens_details?.reasoning_tokens,
        cachedTokens: usage.prompt_tokens_details?.cached_tokens,
      },
      stopReason,
      protocol: "A",
      model: llm.modelA,
    };
  }
  yield { type: "done" };
}
