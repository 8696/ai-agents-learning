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

export async function streamOnceBRawEvents(
  llm: Llm,
  body: DemoCallBody,
  res: ServerResponse,
): Promise<void> {
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
  console.log(
    `[${(performance.now() / 1000).toFixed(2)}s] /api/b-stream-raw: 流结束，共 ${eventIdx} 个事件`,
  );
  writer.done();
}
