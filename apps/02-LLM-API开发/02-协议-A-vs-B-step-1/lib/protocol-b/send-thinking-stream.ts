/**
 * 职责：协议 B 流式 + 启用 thinking —— 原样转发 SDK streamEvent。
 * 数据流：thinking.enabled → on("streamEvent") → 每事件一帧 SSE → [DONE]。
 * 本文件禁止 import openai。
 */
import { performance } from "node:perf_hooks";
import type { ServerResponse } from "node:http";
import type { Llm } from "../../../../llm.js";
import type { DemoCallBody } from "../compare/types.js";
import { openSseStream } from "../http/sse-writer.js";

export async function streamOnceBThinkingEvents(
  llm: Llm,
  body: DemoCallBody,
  res: ServerResponse,
): Promise<void> {
  const thinkingBudget = body.thinkingBudget ?? 500;
  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/b-thinking-stream: budget=${thinkingBudget}`,
  );

  const stream = llm.anthropic.messages.stream({
    model: llm.modelB,
    system: body.system,
    max_tokens: Math.max(thinkingBudget, 2048),
    temperature: 1,
    thinking: { type: "enabled", budget_tokens: thinkingBudget },
    messages: [{ role: "user", content: body.message }],
  });
  const writer = openSseStream(res);

  let eventIdx = 0;
  // ① 用 streamEvent 拿原始事件，不要 on("text")——thinking block 不会走 text
  stream.on("streamEvent", (evt: unknown) => {
    eventIdx += 1;
    const plain = JSON.parse(JSON.stringify(evt)) as { type?: string };
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/b-thinking-stream 事件 #${eventIdx}: ${plain.type ?? "(no type)"}`,
    );
    writer.frame(plain);
  });

  await stream.finalMessage();
  console.log(
    `[${(performance.now() / 1000).toFixed(2)}s] /api/b-thinking-stream: 流结束，共 ${eventIdx} 个事件`,
  );
  writer.done();
}
