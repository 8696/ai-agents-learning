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
import { aMessages } from "./send-once.js";
import { protocolAExtras } from "./think-extract.js";

export async function streamOnceARawChunks(
  llm: Llm,
  body: DemoCallBody,
  res: ServerResponse,
): Promise<void> {
  const messages = aMessages(body);
  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/a: messages.length=${messages.length}`,
  );

  // ① 先 create：失败时 headers 还没发，route 才能写 JSON 500
  const stream = await llm.openai.chat.completions.create({
    model: llm.modelA,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...protocolAExtras(body.enableThinking),
  });
  const writer = openSseStream(res);

  let frameIdx = 0;
  for await (const chunk of stream) {
    if (writer.isClosed()) break;
    frameIdx += 1;
    // ① zod 实例必须 plain 化，否则 JSON.stringify 得到 {}
    const plain = JSON.parse(JSON.stringify(chunk));
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/a 帧 #${frameIdx}: ${JSON.stringify(plain).slice(0, 200)}`,
    );
    writer.frame(plain);
  }
  console.log(
    `[${(performance.now() / 1000).toFixed(2)}s] /api/a: 完成，共 ${frameIdx} 帧`,
  );
  writer.done();
}
