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
import { logger } from "../logger.js";

export async function streamOnceBThinkingEvents(
  llm: Llm,
  body: DemoCallBody,
  res: ServerResponse,
): Promise<void> {
  const thinkingBudget = body.thinkingBudget ?? 500;
  // max_tokens 必须 ≥ budget_tokens，否则 SDK / 上游拒
  const maxTokens = Math.max(thinkingBudget, 2048);
  logger.info(
    "llm.request.protocolB",
    "→ anthropic messages.stream（流式 / 启用 thinking / 给 /api/b-thinking-stream）",
    "协议 B 流式 + 启用 thinking —— thinking.enabled 必须在顶层 + max_tokens ≥ budget（这条常被忘，打详细便于排错）",
    {
      model: llm.modelB,
      systemAtTopLevel: typeof body.system === "string" && body.system.length > 0,
      maxTokens,
      thinking: { type: "enabled", budget_tokens: thinkingBudget },
      temperature: 1,
      messagesCount: 1,
      __code: `llm.anthropic.messages.stream({\n  model: ${JSON.stringify(llm.modelB)},\n  system: ${JSON.stringify(body.system ?? null)},\n  max_tokens: ${maxTokens},\n  temperature: 1,\n  thinking: { type: "enabled", budget_tokens: ${thinkingBudget} },\n  messages: [{ role: "user", content: ${JSON.stringify(body.message)} }],\n})`,
    },
  );
  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/b-thinking-stream: budget=${thinkingBudget}`,
  );

  const stream = llm.anthropic.messages.stream({
    model: llm.modelB,
    system: body.system,
    max_tokens: maxTokens,
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
    logger.debug(
      "llm.response.protocolB",
      `← thinking streamEvent #${eventIdx} type=${plain.type ?? "(no type)"}`,
      "协议 B 流式启用 thinking 每事件 —— thinking block 是 content_block_delta(type=thinking) 不是 text，必须用 streamEvent 才能拿到",
      { eventIdx, eventType: plain.type, event: plain },
    );
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/b-thinking-stream 事件 #${eventIdx}: ${plain.type ?? "(no type)"}`,
    );
    writer.frame(plain);
  });

  await stream.finalMessage();
  logger.info(
    "llm.response.protocolB",
    "← thinking 流式结束",
    "协议 B 流式启用 thinking 整轮完成 —— 打总事件数便于核对 thinking 块是否真发出去了（没思考就 0 个 thinking 事件）",
    { eventIdx, elapsedMs: Math.round(performance.now()) },
  );
  console.log(
    `[${(performance.now() / 1000).toFixed(2)}s] /api/b-thinking-stream: 流结束，共 ${eventIdx} 个事件`,
  );
  writer.done();
}
