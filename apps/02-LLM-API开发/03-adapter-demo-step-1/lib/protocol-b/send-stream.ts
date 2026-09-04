/**
 * 职责：协议 B 流式调用 —— Anthropic 事件回调桥成 AsyncGenerator&lt;UnifiedDelta&gt;。
 * 数据流：messages.stream → streamEvent 队列 → thinking_delta / text_delta / usage / done。
 * 本文件禁止 import openai。
 */
import type { Llm } from "../../../../llm.js";
import type { SendMessageOptions, UnifiedDelta } from "../adapter/types.js";
import { thinkingEnabled } from "../adapter/types.js";
import { logger } from "../logger.js";

export async function* sendViaBStream(
  llm: Llm,
  opts: SendMessageOptions,
): AsyncGenerator<UnifiedDelta> {
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
    "llm.request.protocolB.stream",
    "→ 调用 anthropic.messages.stream",
    "adapter 已分叉到协议 B 流式分支；拿到的是 EventStream 不是 AsyncIterable，需要用 on('streamEvent') 桥接；完整打请求体便于对照 SDK 文档",
    {
      protocol: "B",
      mode: "stream",
      sdk: "anthropic",
      model: llm.modelB,
      hasSystem: Boolean(opts.system),
      maxTokens,
      thinkingEnabled: thinkingOn,
      messagesCount: 1,
      __code: JSON.stringify(requestBody, null, 2),
    },
  );

  const stream = llm.anthropic.messages.stream(requestBody);

  logger.info(
    "llm.response.protocolB.stream",
    "← got stream handle",
    "拿到 EventStream 句柄（不是最终响应）；后续用 streamEvent 队列桥接 unified delta，message_stop 后再 finalMessage() 兜底拿 usage",
    {
      protocol: "B",
      mode: "stream",
      streamType: "MessageStream (EventStream)",
    },
  );

  const queue: unknown[] = [];
  let waiter: (() => void) | null = null;
  let ended = false;

  stream.on("streamEvent", (evt: unknown) => {
    queue.push(evt);
    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  });
  stream.on("error", (err: unknown) => {
    ended = true;
    queue.push({ type: "_error", error: err });
    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  });
  stream.on("end", () => {
    ended = true;
    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  });

  let usage: {
    input_tokens?: number;
    output_tokens?: number;
    output_tokens_details?: { thinking_tokens?: number };
    cache_read_input_tokens?: number;
  } | null = null;
  let stopReason = "unknown";

  while (true) {
    if (queue.length === 0 && !ended) {
      await new Promise<void>((resolve) => {
        waiter = resolve;
      });
    }
    if (queue.length === 0 && ended) break;
    const evt = queue.shift() as { type: string; [k: string]: unknown };

    if (evt.type === "_error") {
      throw (evt as { type: string; error?: unknown }).error;
    }

    const plain = JSON.parse(JSON.stringify(evt));
    const type = plain.type;

    if (type === "content_block_delta") {
      const d = plain.delta || {};
      if (d.thinking != null) yield { type: "thinking", text: d.thinking };
      else if (d.text != null) yield { type: "content", text: d.text };
    } else if (type === "message_delta") {
      if (plain.delta?.stop_reason) stopReason = plain.delta.stop_reason;
      if (plain.usage) usage = { ...(usage || {}), ...plain.usage };
    } else if (type === "message_start") {
      if (plain.message?.usage) usage = { ...(usage || {}), ...plain.message.usage };
    } else if (type === "message_stop") {
      break;
    }
  }

  await stream.finalMessage().catch(() => undefined);

  if (usage) {
    logger.info(
      "llm.response.protocolB.stream.usage",
      "← got usage",
      "汇总自 message_start / message_delta 块的最终 usage；完整打便于核对 input_tokens / output_tokens / cache_read",
      usage,
    );
    yield {
      type: "usage",
      usage: {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
        thinkingTokens: usage.output_tokens_details?.thinking_tokens,
        cachedTokens: usage.cache_read_input_tokens,
      },
      stopReason,
      protocol: "B",
      model: llm.modelB,
    };
  }
  yield { type: "done" };
}
