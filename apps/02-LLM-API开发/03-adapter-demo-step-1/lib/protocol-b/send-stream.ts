/**
 * 职责：协议 B 流式调用 —— Anthropic 事件回调桥成 AsyncGenerator&lt;UnifiedDelta&gt;。
 * 数据流：messages.stream → streamEvent 队列 → thinking_delta / text_delta / usage / done。
 * 本文件禁止 import openai。
 */
import type { Llm } from "../../../../llm.js";
import type { SendMessageOptions, UnifiedDelta } from "../adapter/types.js";
import { thinkingEnabled } from "../adapter/types.js";

export async function* sendViaBStream(
  llm: Llm,
  opts: SendMessageOptions,
): AsyncGenerator<UnifiedDelta> {
  const thinkingOn = thinkingEnabled(opts);
  const thinkingCfg = opts.thinking ?? { type: "enabled" as const, budget_tokens: 1024 };
  const maxTokens = thinkingOn
    ? Math.max(thinkingCfg.budget_tokens + 1024, llm.maxTokensB, 2048)
    : llm.maxTokensB;

  const stream = llm.anthropic.messages.stream({
    model: llm.modelB,
    system: opts.system,
    max_tokens: maxTokens,
    ...(thinkingOn ? { temperature: 1 as const, thinking: thinkingCfg } : {}),
    messages: [{ role: "user", content: opts.message }],
  });

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
