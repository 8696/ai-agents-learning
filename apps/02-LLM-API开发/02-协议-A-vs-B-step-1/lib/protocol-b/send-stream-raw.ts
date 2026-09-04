/**
 * 职责：协议 B 流式（不启用 thinking）—— 原样转发事件并包一层 meta。
 * 数据流：不传 thinking → on("streamEvent") → { type:"anthropic_event", eventIdx, event }。
 * 本文件禁止 import openai。
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
  logger.info(
    "llm.request.protocolB",
    "→ anthropic messages.stream（流式 / 不启用 thinking / 给 /api/b-stream-raw 看原样事件）",
    "协议 B 流式 + 原样转发 —— 不传 thinking → on(streamEvent) 拿 SDK 原始事件，便于对照 A 的 openai_chunk",
    {
      model: llm.modelB,
      systemAtTopLevel: typeof body.system === "string" && body.system.length > 0,
      maxTokens: llm.maxTokensB,
      thinking: null,
      messagesCount: 1,
      __code: `llm.anthropic.messages.stream({\n  model: ${JSON.stringify(llm.modelB)},\n  system: ${JSON.stringify(body.system ?? null)},\n  max_tokens: ${llm.maxTokensB},\n  messages: [{ role: "user", content: ${JSON.stringify(body.message)} }],\n})`,
    },
  );
  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/b-stream-raw: system=${body.system ? "顶层" : "无"}, thinking=不启用`,
  );

  const stream = llm.anthropic.messages.stream({
    model: llm.modelB,
    system: body.system,
    max_tokens: llm.maxTokensB,
    messages: [{ role: "user", content: body.message }],
  });
  const writer = openSseStream(res);

  let eventIdx = 0;
  stream.on("streamEvent", (evt: unknown) => {
    eventIdx += 1;
    const plain = JSON.parse(JSON.stringify(evt)) as { type?: string };
    logger.debug(
      "llm.response.protocolB",
      `← streamEvent #${eventIdx} type=${plain.type ?? "(no type)"}`,
      "协议 B 流式原样事件 —— 每事件打 type 便于回看事件序列（message_start / content_block_* / message_delta / message_stop）",
      { eventIdx, eventType: plain.type, event: plain },
    );
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/b-stream-raw 事件 #${eventIdx}: ${plain.type ?? "(no type)"}`,
    );
    writer.frame({
      type: "anthropic_event",
      eventIdx,
      event: plain,
    });
  });

  await stream.finalMessage();
  logger.info(
    "llm.response.protocolB",
    "← 流式结束",
    "协议 B 流式原样事件轮完成 —— 打总事件数便于核对漏事件",
    { eventIdx, elapsedMs: Math.round(performance.now()) },
  );
  console.log(
    `[${(performance.now() / 1000).toFixed(2)}s] /api/b-stream-raw: 流结束，共 ${eventIdx} 个事件`,
  );
  writer.done();
}
