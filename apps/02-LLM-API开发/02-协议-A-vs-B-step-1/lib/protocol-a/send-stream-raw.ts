/**
 * 职责：协议 A 流式原样转发 + meta.kind（给页面按颜色分类）。
 * 数据流：每帧 { type:"openai_chunk", kind, frameIdx, chunk } → [DONE]。
 * 本文件禁止 import @anthropic-ai/sdk。
 *
 * 日志（§5.3.16）：调用函数 五条日志（streamOnceAClassified 封装层），调用模型 五条日志（真正发网络请求的那一层）；
 *   流式规则：只在收尾写一次完整返回值，中间 chunk 写 debug 即可。
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

  const tFuncStart = Date.now();
  logger.info(
    "│ 协议A 流式-classified",
    "调用函数开始：streamOnceAClassified",
    "为什么写这条日志：route 只认这一层把带 kind 的帧写到 res；里面那次才是真发网络请求（看「调用模型开始：协议A-对话补全」）。当前：即将发 stream:true 请求给 /api/a-stream-raw 页面看分类。",
    {
      入参: { systemLen: (body.system ?? "").length, messageLen: body.message.length, enableThinking: body.enableThinking },
      __code: `const stream = await llm.openai.chat.completions.create(${JSON.stringify(requestPayload, null, 2)});\nfor await (const chunk of stream) { writer.frame({ type: "openai_chunk", kind, frameIdx, chunk }); }`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    "为什么写这条日志：本文件唯一真正发网络请求的那一层；不写就没有 frameCount / usage / kind 分类依据。当前：即将发出 stream:true 请求。",
    {
      入参: {
        model: requestPayload.model,
        messagesCount: requestPayload.messages.length,
        stream: requestPayload.stream,
        includeUsage: true,
        extras: extras as Record<string, unknown>,
      },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(requestPayload, null, 2)})`,
    },
  );

  let stream;
  try {
    stream = await llm.openai.chat.completions.create(requestPayload);
  } catch (error: unknown) {
    logger.error(
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全（失败）",
      "为什么写这条日志：拿到 upstreamStatus 才能区分 401/403（Key）、429（限流）、5xx。当前：create 抛错，headers 还没发，route 才能写 JSON 500。",
      {
        返回值: { message: error instanceof Error ? error.message : String(error) },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    throw error;
  }

  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/a-stream-raw: messages.length=${messages.length}`,
  );
  const writer = openSseStream(res);

  let frameIdx = 0;
  const kindCounts: Record<string, number> = {};
  for await (const chunk of stream) {
    if (writer.isClosed()) break;
    frameIdx += 1;
    const plain = JSON.parse(JSON.stringify(chunk));
    const kind = classifyOpenAiChunkKind(plain);
    const delta = plain.choices?.[0]?.delta;
    kindCounts[kind] = (kindCounts[kind] ?? 0) + 1;
    writer.frame({
      type: "openai_chunk",
      kind,
      frameIdx,
      chunk: plain,
    });
    logger.debug(
      "││ 调用模型-协议A 对话补全",
      `← 流式分类帧 #${frameIdx} kind=${kind}`,
      "协议 A 流式每帧带分类 —— 打 kind + delta 关键字段便于页面颜色对照 / 回看",
      { frameIdx, kind, deltaContent: delta?.content ?? null, hasReasoning: Boolean(delta?.reasoning_content ?? delta?.reasoning ?? delta?.reasoning_details) },
    );
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/a-stream-raw 帧 #${frameIdx} [${kind}]: delta.content=${JSON.stringify(delta?.content ?? "").slice(0, 60)}`,
    );
  }
  // 流式规则（§5.3.16）：只在收尾写一次完整返回值。
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型结束：协议A 对话补全",
    "为什么写这条日志：流式场景只在收尾写一次完整返回值（kind 分布便于事后核对「有没有真发出 thinking 帧」）。当前：for await 已退出，下一步 writer.done()。",
    {
      返回值: { frameCount: frameIdx, kindCounts, elapsedMs: Date.now() - tModelStart },
      字段释义: {
        kindCounts: "本次流式按 kind 分类计数（text / reasoning / tool_calls / usage / other）",
      },
    },
  );
  logger.info(
    "│ 协议A 流式-classified",
    "调用函数结束：streamOnceAClassified",
    "为什么写这条日志：route 已经把 [DONE] 写出，连接关闭；写耗时便于和协议 B 流式对照。当前：stream 已消费完。",
    {
      返回值: { frameCount: frameIdx, kindCounts },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  console.log(
    `[${(performance.now() / 1000).toFixed(2)}s] /api/a-stream-raw: 完成，共 ${frameIdx} 帧`,
  );
  writer.done();
}