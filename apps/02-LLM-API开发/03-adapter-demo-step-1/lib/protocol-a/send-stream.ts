/**
 * 职责：协议 A 流式调用 —— openai 异步迭代器 → UnifiedDelta。
 * 数据流：stream:true + include_usage → splitProtocolADelta → yield thinking/content/usage/done。
 * 本文件禁止 import @anthropic-ai/sdk。
 *
 * 日志（§5.3.16）：调用函数 五件套（sendViaAStream 封装层），调用模型 五件套（出网层）；
 *   流式规则（§5.3.16）：只在收尾打一次完整返回值，中间 chunk 不套五件套。
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

  const tFuncStart = Date.now();
  logger.info(
    "│ 协议A 流式-sendViaAStream",
    "调用函数开始：sendViaAStream",
    "为什么打：sendMessageStream 只认这一层 yield 出的 UnifiedDelta；里面那次才是出网（看「调用模型开始：协议A-对话补全」）。当前：即将发协议 A 流式调用。",
    {
      入参: { protocol: "A", mode: "stream", sdk: "openai", systemLen: (opts.system ?? "").length, messageLen: opts.message.length, thinkingEnabled: thinkingEnabled(opts) },
      __code: `const stream = await llm.openai.chat.completions.create(${JSON.stringify(requestBody, null, 2)});\nfor await (const chunk of stream) { ... yield unified delta ... }`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    "为什么打：本文件唯一的真出网层；不打就没有 usage / chunk 流。当前：即将发出 stream:true + include_usage 请求；adapter 已分叉到协议 A 流式。",
    {
      入参: {
        model: requestBody.model,
        messagesCount: requestBody.messages.length,
        stream: requestBody.stream,
        includeUsage: true,
        thinkingEnabled: thinkingEnabled(opts),
      },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(requestBody, null, 2)});`,
    },
  );

  const stream = await llm.openai.chat.completions.create(requestBody);

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

  // 流式规则（§5.3.16）：只在收尾打一次完整返回值。
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型结束：协议A 对话补全",
    "为什么打：流式场景只在收尾打一次完整返回值（末尾 usage 块 + stopReason）；便于核对 final usage / 总帧数。当前：for await 已退出，下一步 yield usage + done。",
    {
      返回值: { usage, stopReason },
      耗时ms: Date.now() - tModelStart,
      字段释义: {
        "usage.prompt_tokens_details.cached_tokens": "命中 prompt cache 的 Token 数",
        "usage.completion_tokens_details.reasoning_tokens": "thinking 单独计费的 Token 数",
        stopReason: "stop=正常 / length=撞 max_tokens / content_filter=策略拦下",
      },
    },
  );

  if (usage) {
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

  logger.info(
    "│ 协议A 流式-sendViaAStream",
    "调用函数结束：sendViaAStream",
    "为什么打：sendMessageStream 已经把 UnifiedDelta 都 yield 出去；打耗时便于和协议 B 流式对照。当前：done 已 yield。",
    {
      返回值: { protocol: "A", mode: "stream", hasUsage: Boolean(usage) },
      耗时ms: Date.now() - tFuncStart,
    },
  );
}