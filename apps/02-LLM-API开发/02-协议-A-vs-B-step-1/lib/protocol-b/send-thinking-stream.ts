/**
 * 职责：协议 B 流式 + 启用 thinking —— 原样转发 SDK streamEvent。
 * 数据流：thinking.enabled → on("streamEvent") → 每事件一帧 SSE → [DONE]。
 * 本文件禁止 import openai。
 *
 * 日志（§5.3.16）：调用函数 五条日志（streamOnceBThinkingEvents 封装层），调用模型 五条日志（真正发网络请求的那一层）；
 *   流式规则：只在收尾写一次完整返回值，中间 event 写 debug。
 */
import { performance } from "node:perf_hooks";
import type { ServerResponse } from "node:http";
import type { Llm } from "../../../../llm.js";
import type { DemoCallBody } from "../compare/types.js";
import { openSseStream } from "../http/sse-writer.js";
import { logger } from "../logger.js";

export async function streamOnceBThinkingEvents(
  llm: Llm,
  body: DemoCallBody,
  res: ServerResponse,
): Promise<void> {
  const thinkingBudget = body.thinkingBudget ?? 500;
  // max_tokens 必须 ≥ budget_tokens，否则 SDK / 上游拒
  const maxTokens = Math.max(thinkingBudget, 2048);

  const tFuncStart = Date.now();
  logger.info(
    "│ 协议B 流式-thinkingEvents",
    "调用函数开始：streamOnceBThinkingEvents",
    "为什么写这条日志：route 只认这一层把带 thinking 的事件写到 res；里面那次才是真发网络请求（看「调用模型开始：协议B-消息流」）。当前：即将发 stream，启用 thinking。",
    {
      入参: { systemLen: (body.system ?? "").length, messageLen: body.message.length, thinkingBudget },
      __code: `const stream = llm.anthropic.messages.stream({ ..., thinking: { type: "enabled", budget_tokens: ${thinkingBudget} } });\nstream.on("streamEvent", evt => writer.frame(evt));\nawait stream.finalMessage();`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议B 消息流",
    "调用模型开始：协议B 消息流",
    "为什么写这条日志：本文件唯一真正发网络请求的那一层；不写就没有 thinking 事件数 / usage。当前：即将发出 messages.stream，thinking.enabled 在顶层、max_tokens ≥ budget（这条常被忘，打详细便于排错）。",
    {
      入参: {
        model: llm.modelB,
        systemAtTopLevel: typeof body.system === "string" && body.system.length > 0,
        maxTokens,
        thinking: { type: "enabled", budget_tokens: thinkingBudget },
        temperature: 1,
        messagesCount: 1,
      },
      __code: `llm.anthropic.messages.stream({\n  model: ${JSON.stringify(llm.modelB)},\n  system: ${JSON.stringify(body.system ?? null)},\n  max_tokens: ${maxTokens},\n  temperature: 1,\n  thinking: { type: "enabled", budget_tokens: ${thinkingBudget} },\n  messages: [{ role: "user", content: ${JSON.stringify(body.message)} }],\n})`,
    },
  );

  const stream = llm.anthropic.messages.stream({
    model: llm.modelB,
    system: body.system,
    max_tokens: maxTokens,
    temperature: 1,
    thinking: { type: "enabled", budget_tokens: thinkingBudget },
    messages: [{ role: "user", content: body.message }],
  });

  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/b-thinking-stream: budget=${thinkingBudget}`,
  );
  const writer = openSseStream(res);

  let eventIdx = 0;
  let thinkingEventCount = 0;
  // ① 用 streamEvent 拿原始事件，不要 on("text")——thinking block 不会走 text
  stream.on("streamEvent", (evt: unknown) => {
    eventIdx += 1;
    const plain = JSON.parse(JSON.stringify(evt)) as { type?: string };
    const type = plain.type ?? "(no type)";
    if (type === "content_block_delta") {
      const deltaType = (plain as { delta?: { type?: string } }).delta?.type;
      if (deltaType === "thinking") thinkingEventCount += 1;
    }
    logger.debug(
      "││ 调用模型-协议B 消息流",
      `← thinking streamEvent #${eventIdx} type=${type}`,
      "协议 B 流式启用 thinking 每事件 —— thinking block 是 content_block_delta(type=thinking) 不是 text，必须用 streamEvent 才能拿到",
      { eventIdx, eventType: type, event: plain },
    );
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/b-thinking-stream 事件 #${eventIdx}: ${type}`,
    );
    writer.frame(plain);
  });

  await stream.finalMessage();
  // 流式规则（§5.3.16）：只在收尾写一次完整返回值。
  logger.info(
    "││ 调用模型-协议B 消息流",
    "调用模型结束：协议B 消息流",
    "为什么写这条日志：流式场景只在收尾写一次完整返回值（thinkingEventCount 便于核对 thinking 块是否真发出去了——没思考就 0 个）。当前：finalMessage 已返回，下一步 writer.done()。",
    {
      返回值: { eventCount: eventIdx, thinkingEventCount, elapsedMs: Date.now() - tModelStart },
      字段释义: {
        thinkingEventCount: "本次流式里 content_block_delta(type=thinking) 的事件数；模型没思考就 0",
      },
    },
  );
  logger.info(
    "│ 协议B 流式-thinkingEvents",
    "调用函数结束：streamOnceBThinkingEvents",
    "为什么写这条日志：route 已经把 [DONE] 写出，连接关闭；写耗时便于和 A 流式对照。当前：stream 已消费完。",
    {
      返回值: { eventCount: eventIdx, thinkingEventCount },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  console.log(
    `[${(performance.now() / 1000).toFixed(2)}s] /api/b-thinking-stream: 流结束，共 ${eventIdx} 个事件`,
  );
  writer.done();
}