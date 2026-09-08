/**
 * 职责：协议 A 流式 —— openai chunk 原样写成 SSE（给 curl /api/a）。
 * 数据流：create(stream:true, include_usage) → 每帧 JSON → [DONE]。
 * 本文件禁止 import @anthropic-ai/sdk。
 *
 * 日志（§5.3.16）：调用函数 五件套（streamOnceARawChunks 封装层），调用模型 五件套（出网层）；
 *   流式规则（§5.3.16）：只在收尾打一次完整返回值，中间 chunk 打 debug 即可。
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

  const tFuncStart = Date.now();
  logger.info(
    "│ 协议A 流式-rawChunks",
    "调用函数开始：streamOnceARawChunks",
    "为什么打：route 只认这一层把 openai chunk 写到 res；里面那次才是出网（看「调用模型开始：协议A-对话补全」）。当前：即将发 stream:true 请求给 curl /api/a。",
    {
      入参: { systemLen: (body.system ?? "").length, messageLen: body.message.length, enableThinking: body.enableThinking },
      __code: `const stream = await llm.openai.chat.completions.create(${JSON.stringify(requestPayload, null, 2)});\nfor await (const chunk of stream) { ... writer.frame(chunk); }`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    "为什么打：真正出网的那一次；不打就没有 frameCount / usage。当前：即将发出 stream:true 请求，include_usage 强制让最后一帧带 usage。",
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
      "为什么打：拿到 upstreamStatus 才能区分 401/403（Key）、429（限流）、5xx。当前：create 抛错，headers 还没发，route 才能写 JSON 500。",
      {
        返回值: { message: error instanceof Error ? error.message : String(error) },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    throw error;
  }

  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/a: messages.length=${messages.length}`,
  );
  const writer = openSseStream(res);

  let frameIdx = 0;
  let lastChunkSummary: Record<string, unknown> | null = null;
  for await (const chunk of stream) {
    if (writer.isClosed()) break;
    frameIdx += 1;
    // ① zod 实例必须 plain 化，否则 JSON.stringify 得到 {}
    const plain = JSON.parse(JSON.stringify(chunk));
    lastChunkSummary = {
      id: (plain as { id?: string }).id,
      model: (plain as { model?: string }).model,
      finishReason: (plain as { choices?: { finish_reason?: string }[] }).choices?.[0]?.finish_reason,
      hasUsage: Boolean((plain as { usage?: unknown }).usage),
    };
    logger.debug(
      "││ 调用模型-协议A 对话补全",
      `← 流式 chunk #${frameIdx}`,
      "协议 A 流式每帧 —— 整帧打便于核对 SDK 字段名（choices / delta / reasoning 字段等）",
      { frameIdx, chunk: plain },
    );
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/a 帧 #${frameIdx}: ${JSON.stringify(plain).slice(0, 200)}`,
    );
    writer.frame(plain);
  }
  // 流式规则（§5.3.16）：只在收尾打一次完整返回值。
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型结束：协议A 对话补全",
    "为什么打：流式场景只在收尾打一次完整返回值（最后帧的 usage + finishReason）；便于核对「是否最后一帧才带 usage」。当前：for await 已退出，下一步 writer.done()。",
    {
      返回值: { frameCount: frameIdx, lastChunkSummary, elapsedMs: Date.now() - tModelStart },
      字段释义: {
        frameCount: "本次流式共推给浏览器多少个 SSE 帧",
        lastChunkSummary: "最后一帧的 id / model / finish_reason / hasUsage（usage 只在 include_usage 时最后一帧才有）",
      },
    },
  );
  logger.info(
    "│ 协议A 流式-rawChunks",
    "调用函数结束：streamOnceARawChunks",
    "为什么打：route 已经把 [DONE] 写出，连接关闭；打耗时便于和协议 B 流式对照。当前：stream 已消费完。",
    {
      返回值: { frameCount: frameIdx },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  console.log(
    `[${(performance.now() / 1000).toFixed(2)}s] /api/a: 完成，共 ${frameIdx} 帧`,
  );
  writer.done();
}