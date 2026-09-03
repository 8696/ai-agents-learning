/**
 * 职责：协议 A 流式原样转发 + meta.kind（给页面按颜色分类）。
 * 数据流：每帧 { type:"openai_chunk", kind, frameIdx, chunk } → [DONE]。
 * 本文件禁止 import @anthropic-ai/sdk。
 */
import { performance } from "node:perf_hooks";
import type { ServerResponse } from "node:http";
import type { Llm } from "../../../../llm.js";
import type { DemoCallBody } from "../compare/types.js";
import { openSseStream } from "../http/sse-writer.js";
import { aMessages } from "./send-once.js";
import { classifyOpenAiChunkKind, protocolAExtras } from "./think-extract.js";

export async function streamOnceAClassified(
  llm: Llm,
  body: DemoCallBody,
  res: ServerResponse,
): Promise<void> {
  const messages = aMessages(body);
  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/a-stream-raw: messages.length=${messages.length}`,
  );

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
    const plain = JSON.parse(JSON.stringify(chunk));
    const kind = classifyOpenAiChunkKind(plain);
    const delta = plain.choices?.[0]?.delta;
    writer.frame({
      type: "openai_chunk",
      kind,
      frameIdx,
      chunk: plain,
    });
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/a-stream-raw 帧 #${frameIdx} [${kind}]: delta.content=${JSON.stringify(delta?.content ?? "").slice(0, 60)}`,
    );
  }
  console.log(
    `[${(performance.now() / 1000).toFixed(2)}s] /api/a-stream-raw: 完成，共 ${frameIdx} 帧`,
  );
  writer.done();
}
