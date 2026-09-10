/**
 * 职责：协议 B 流式调用 —— Anthropic 事件回调桥成 AsyncGenerator<UnifiedDelta>。
 * 数据流：messages.stream → streamEvent 队列 → thinking_delta / text_delta / usage / done。
 * 本文件禁止 import openai。
 *
 * 日志（§5.3.16）：调用函数 五条日志（sendViaBStream 封装层），调用模型 五条日志（真正发网络请求的那一层）；
 *   流式规则（§5.3.16）：只在收尾写一次完整返回值，中间 event 不套五条日志。
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

  const tFuncStart = Date.now();
  logger.info(
    "│ 协议B 流式-sendViaBStream",
    "调用函数开始：sendViaBStream",
    "为什么写这条日志：sendMessageStream 只认这一层 yield 出的 UnifiedDelta；里面那次才是真发网络请求（看「调用模型开始：协议B-消息流」）。当前：即将发协议 B 流式；adapter 已分叉到协议 B 流式。",
    {
      入参: { protocol: "B", mode: "stream", sdk: "anthropic", hasSystem: Boolean(opts.system), messageLen: opts.message.length, thinkingEnabled: thinkingOn, maxTokens },
      __code: `const stream = llm.anthropic.messages.stream(${JSON.stringify(requestBody, null, 2)});\n... streamEvent 队列 ... yield unified delta ...`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议B 消息流",
    "调用模型开始：协议B 消息流",
    "为什么写这条日志：本文件唯一真正发网络请求的那一层；不写就没有 event 序列 / final usage。当前：即将发出 messages.stream，EventStream 句柄需要 on('streamEvent') 桥接。",
    {
      入参: {
        model: requestBody.model,
        systemAtTopLevel: Boolean(opts.system),
        maxTokens,
        thinking: thinkingOn ? thinkingCfg : null,
        messagesCount: 1,
      },
      __code: `llm.anthropic.messages.stream(${JSON.stringify(requestBody, null, 2)});`,
    },
  );

  const stream = llm.anthropic.messages.stream(requestBody);

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

  // 流式规则（§5.3.16）：只在收尾写一次完整返回值。
  logger.info(
    "││ 调用模型-协议B 消息流",
    "调用模型结束：协议B 消息流",
    "为什么写这条日志：流式场景只在收尾写一次完整返回值（汇总自 message_start / message_delta 的最终 usage）。当前：finalMessage 已返回，下一步 yield usage + done。",
    {
      返回值: { usage, stopReason },
      耗时ms: Date.now() - tModelStart,
      字段释义: {
        "usage.input_tokens": "输入侧 Token 数（与 A 的 prompt_tokens 对照）",
        "usage.output_tokens": "输出侧 Token 数（与 A 的 completion_tokens 对照）",
        "usage.cache_read_input_tokens": "命中 cache 的 Token 数",
        "usage.output_tokens_details.thinking_tokens": "thinking 单独计费的 Token 数",
        stopReason: "end_turn=自然结束 / max_tokens=撞 max_tokens / tool_use=模型想调工具",
      },
    },
  );

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

  logger.info(
    "│ 协议B 流式-sendViaBStream",
    "调用函数结束：sendViaBStream",
    "为什么写这条日志：sendMessageStream 已经把 UnifiedDelta 都 yield 出去；写耗时便于和协议 A 流式对照。当前：done 已 yield。",
    {
      返回值: { protocol: "B", mode: "stream", hasUsage: Boolean(usage) },
      耗时ms: Date.now() - tFuncStart,
    },
  );
}