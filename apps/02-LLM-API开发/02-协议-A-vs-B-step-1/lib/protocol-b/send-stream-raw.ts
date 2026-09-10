/**
 * 职责：协议 B 流式（不启用 thinking）—— 原样转发事件并包一层 meta。
 * 数据流：不传 thinking → on("streamEvent") → { type:"anthropic_event", eventIdx, event }。
 * 本文件禁止 import openai。
 *
 * 日志（§5.3.16）：调用函数 五条日志（streamOnceBRawEvents 封装层），调用模型 五条日志（真正发网络请求的那一层）；
 *   流式规则：只在收尾写一次完整返回值，中间 event 写 debug。
 */
import { performance } from "node:perf_hooks";
import type { ServerResponse } from "node:http";
import type { Llm } from "../../../../llm.js";
import type { DemoCallBody } from "../compare/types.js";
import { openSseStream } from "../http/sse-writer.js";
import { logger } from "../logger.js";

export async function streamOnceBRawEvents(
  llm: Llm,
  body: DemoCallBody,
  res: ServerResponse,
): Promise<void> {
  const tFuncStart = Date.now();
  logger.info(
    "│ 协议B 流式-rawEvents",
    "调用函数开始：streamOnceBRawEvents",
    "为什么写这条日志：route 只认这一层把原样事件写到 res；里面那次才是真发网络请求（看「调用模型开始：协议B-消息流」）。当前：即将发 stream，给 /api/b-stream-raw 页面看原样事件。",
    {
      入参: { systemLen: (body.system ?? "").length, messageLen: body.message.length },
      __code: `const stream = llm.anthropic.messages.stream({ ... });\nstream.on("streamEvent", evt => { writer.frame({ type: "anthropic_event", eventIdx, event: evt }); });\nawait stream.finalMessage();`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议B 消息流",
    "调用模型开始：协议B 消息流",
    "为什么写这条日志：本文件唯一真正发网络请求的那一层；不写就没有 eventIdx / eventCount。当前：即将发出 messages.stream，用 streamEvent 拿原始事件。",
    {
      入参: {
        model: llm.modelB,
        systemAtTopLevel: typeof body.system === "string" && body.system.length > 0,
        maxTokens: llm.maxTokensB,
        thinking: null,
        messagesCount: 1,
      },
      __code: `llm.anthropic.messages.stream({\n  model: ${JSON.stringify(llm.modelB)},\n  system: ${JSON.stringify(body.system ?? null)},\n  max_tokens: ${llm.maxTokensB},\n  messages: [{ role: "user", content: ${JSON.stringify(body.message)} }],\n})`,
    },
  );

  const stream = llm.anthropic.messages.stream({
    model: llm.modelB,
    system: body.system,
    max_tokens: llm.maxTokensB,
    messages: [{ role: "user", content: body.message }],
  });

  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/b-stream-raw: system=${body.system ? "顶层" : "无"}, thinking=不启用`,
  );
  const writer = openSseStream(res);

  let eventIdx = 0;
  const eventTypeCounts: Record<string, number> = {};
  stream.on("streamEvent", (evt: unknown) => {
    eventIdx += 1;
    const plain = JSON.parse(JSON.stringify(evt)) as { type?: string };
    const type = plain.type ?? "(no type)";
    eventTypeCounts[type] = (eventTypeCounts[type] ?? 0) + 1;
    logger.debug(
      "││ 调用模型-协议B 消息流",
      `← streamEvent #${eventIdx} type=${type}`,
      "协议 B 流式原样事件 —— 每事件打 type 便于回看事件序列（message_start / content_block_* / message_delta / message_stop）",
      { eventIdx, eventType: type, event: plain },
    );
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/b-stream-raw 事件 #${eventIdx}: ${type}`,
    );
    writer.frame({
      type: "anthropic_event",
      eventIdx,
      event: plain,
    });
  });

  await stream.finalMessage();
  // 流式规则（§5.3.16）：只在收尾写一次完整返回值。
  logger.info(
    "││ 调用模型-协议B 消息流",
    "调用模型结束：协议B 消息流",
    "为什么写这条日志：流式场景只在收尾写一次完整返回值（事件类型分布便于核对漏事件）。当前：finalMessage 已返回，下一步 writer.done()。",
    {
      返回值: { eventCount: eventIdx, eventTypeCounts, elapsedMs: Date.now() - tModelStart },
      字段释义: {
        eventTypeCounts: "本次流式按事件类型计数（message_start / content_block_* / message_delta / message_stop）",
      },
    },
  );
  logger.info(
    "│ 协议B 流式-rawEvents",
    "调用函数结束：streamOnceBRawEvents",
    "为什么写这条日志：route 已经把 [DONE] 写出，连接关闭；写耗时便于和 A 流式对照。当前：stream 已消费完。",
    {
      返回值: { eventCount: eventIdx, eventTypeCounts },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  console.log(
    `[${(performance.now() / 1000).toFixed(2)}s] /api/b-stream-raw: 流结束，共 ${eventIdx} 个事件`,
  );
  writer.done();
}