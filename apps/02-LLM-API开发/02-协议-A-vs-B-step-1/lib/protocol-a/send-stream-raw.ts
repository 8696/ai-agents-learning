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
import { logger } from "../logger.js";
import { aMessages } from "./send-once.js";
import { classifyOpenAiChunkKind, protocolAExtras } from "./think-extract.js";

export async function streamOnceAClassified(
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
    "→ openai chat.completions.create（流式 + meta.kind 给 /api/a-stream-raw 页面看分类）",
    "协议 A 流式 + 分类转发请求 —— 打是否开 thinking + kind 分类开关",
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
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/a-stream-raw: messages.length=${messages.length}`,
  );

  const stream = await llm.openai.chat.completions.create(requestPayload);
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
    logger.debug(
      "llm.response.protocolA",
      `← 流式分类帧 #${frameIdx} kind=${kind}`,
      "协议 A 流式每帧带分类 —— 打 kind + delta 关键字段便于页面颜色对照 / 回看",
      { frameIdx, kind, deltaContent: delta?.content ?? null, hasReasoning: Boolean(delta?.reasoning_content ?? delta?.reasoning ?? delta?.reasoning_details) },
    );
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/a-stream-raw 帧 #${frameIdx} [${kind}]: delta.content=${JSON.stringify(delta?.content ?? "").slice(0, 60)}`,
    );
  }
  logger.info(
    "llm.response.protocolA",
    "← 流式分类结束",
    "协议 A 流式分类轮完成 —— 打总帧数便于核对漏帧",
    { frameIdx, elapsedMs: Math.round(performance.now()) },
  );
  console.log(
    `[${(performance.now() / 1000).toFixed(2)}s] /api/a-stream-raw: 完成，共 ${frameIdx} 帧`,
  );
  writer.done();
}
