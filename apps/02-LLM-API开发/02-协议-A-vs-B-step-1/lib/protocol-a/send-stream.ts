/**
 * 职责：协议 A 流式 —— openai chunk 原样写成 SSE（给 curl /api/a）。
 * 数据流：create(stream:true, include_usage) → 每帧 JSON → [DONE]。
 * 本文件禁止 import @anthropic-ai/sdk。
 */
import { performance } from "node:perf_hooks";
import type { ServerResponse } from "node:http";
import type { Llm } from "../../../../llm.js";
import type { DemoCallBody } from "../compare/types.js";
import { openSseStream } from "../http/sse-writer.js";
import { logger } from "../logger.js";
import { aMessages } from "./send-once.js";
import { protocolAExtras } from "./think-extract.js";

export async function streamOnceARawChunks(
  llm: Llm,
  body: DemoCallBody,
  res: ServerResponse,
): Promise<void> {
  const messages = aMessages(body);
  const extras = protocolAExtras(body.enableThinking);
  const requestPayload = {
    model: llm.modelA,
    messages,
    stream: true as const,
    stream_options: { include_usage: true },
    ...extras,
  };
  logger.info(
    "llm.request.protocolA",
    "→ openai chat.completions.create（流式 / stream:true 给 curl /api/a）",
    "协议 A 流式原样转发请求 —— 打 stream / include_usage / 是否开 thinking 便于和 B 对照 streaming 协议面",
    {
      model: llm.modelA,
      messagesCount: messages.length,
      stream: true,
      includeUsage: true,
      enableThinking: body.enableThinking,
      extras: extras as Record<string, unknown>,
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(requestPayload, null, 2)})`,
    },
  );
  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/a: messages.length=${messages.length}`,
  );

  // ① 先 create：失败时 headers 还没发，route 才能写 JSON 500
  const stream = await llm.openai.chat.completions.create(requestPayload);
  const writer = openSseStream(res);

  let frameIdx = 0;
  for await (const chunk of stream) {
    if (writer.isClosed()) break;
    frameIdx += 1;
    // ① zod 实例必须 plain 化，否则 JSON.stringify 得到 {}
    const plain = JSON.parse(JSON.stringify(chunk));
    logger.debug(
      "llm.response.protocolA",
      `← 流式 chunk #${frameIdx}`,
      "协议 A 流式每帧 —— 整帧打便于核对 SDK 字段名（choices / delta / reasoning 字段等）",
      { frameIdx, chunk: plain },
    );
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/a 帧 #${frameIdx}: ${JSON.stringify(plain).slice(0, 200)}`,
    );
    writer.frame(plain);
  }
  logger.info(
    "llm.response.protocolA",
    "← 流式结束",
    "协议 A 流式整轮完成 —— 打总帧数 / 耗时便于核对是否漏帧",
    { frameIdx, elapsedMs: Math.round(performance.now()) },
  );
  console.log(
    `[${(performance.now() / 1000).toFixed(2)}s] /api/a: 完成，共 ${frameIdx} 帧`,
  );
  writer.done();
}
