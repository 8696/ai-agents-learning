/**
 * 职责：本 Demo 唯一的业务流程 —— 一条 user 消息走协议 A 流式，逐 chunk 变成 SSE 帧。
 *
 * 数据流：
 *   { llm, message, writer }
 *     → chat.completions.create({ stream: true, stream_options: { include_usage: true } })
 *     → for await chunk → writer.frame(chunk)（原样转发，页面才看得见真实协议字段）
 *     → 汇总 usage / 帧数 → writer.done() 发 [DONE]
 *   上游失败 → writer.frame({ error, upstreamStatus }) → writer.done()
 *
 * 为什么单独成文件：
 *   routes/chat.ts 只该做「校验 + 开流 + 交给谁」；把 for await 循环抄进 route，
 *   以后换成多轮对话或加重试，route 就会滚成一大坨。这里也完全不碰 koa 的 ctx。
 */
import OpenAI from "openai";
import type { Llm } from "../../../../llm.js";
import type { SseWriter } from "../sse/sse-writer.js";
import { logger } from "../logger.js";

/** 一次流式对话跑完之后，服务端日志与页面统计都用得上的数字。 */
export type StreamChatStats = {
  frameCount: number;
  usage: OpenAI.Completions.CompletionUsage | undefined;
  /** 上游报错时填；正常为 undefined */
  failed?: { message: string; upstreamStatus?: number };
};

/**
 * 组装协议 A 的请求体。
 * 单独一小段是为了让「模块 00 的最小闭环到底发了什么」一眼看完：
 * 只有 model + 一条 user 消息 + stream 开关，没有 system、没有历史、没有 tools。
 */
function buildChatRequest(
  llm: Llm,
  message: string,
): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
  return {
    model: llm.modelA,
    messages: [{ role: "user", content: message }],
    stream: true,
    // 部分兼容网关支持在流的最后一帧带 usage；不支持时页面会提示去控制台查账单
    stream_options: { include_usage: true },
  };
}

/**
 * 把上游异常翻译成「页面能显示的一句话 + HTTP 状态码」。
 * upstreamStatus 很关键：401/403 是 Key 不对，429 是限流，5xx 才是对方挂了 ——
 * 只打印 message 的话，这三种会长得一模一样，排错时全靠猜。
 */
function describeUpstreamError(error: unknown): {
  message: string;
  upstreamStatus?: number;
} {
  if (error instanceof OpenAI.APIError) {
    return { message: error.message, upstreamStatus: error.status };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}

/**
 * 消费 SDK 的异步流，逐 chunk 转成 SSE 帧。
 * 原样转发整个 chunk（不是只挑 delta.content）：模块 00 的教学点就是
 * 「看见真实的 choices[0].delta / finish_reason / usage 长什么样」，挑完就没得看了。
 */
async function pumpChunksToSse(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  writer: SseWriter,
): Promise<{ frameCount: number; usage: OpenAI.Completions.CompletionUsage | undefined }> {
  let frameCount = 0;
  let usage: OpenAI.Completions.CompletionUsage | undefined;

  for await (const chunk of stream) {
    // 浏览器已经关掉了：继续拉上游只是白烧 Token，直接停
    if (writer.isClosed()) break;
    writer.frame(chunk);
    frameCount += 1;
    if (chunk.usage) usage = chunk.usage;
  }

  return { frameCount, usage };
}

/**
 * 主流程。调用方（routes/chat.ts）已经确认过 llm 非空、message 非空、SSE 头已发出。
 *
 * ① 先建上游流：这一步就可能抛（Key 错、网络不通），此时 SSE 头已发出去了，
 *    没法再改 HTTP 状态码，所以错误只能以「错误帧」的形式回给页面
 * ② 逐 chunk 转发，同时收 usage
 * ③ 不论成败都要 done()：少了 [DONE]，页面的读循环会一直等到超时才结束
 */
export async function streamChatToSse(params: {
  llm: Llm;
  message: string;
  writer: SseWriter;
}): Promise<StreamChatStats> {
  const { llm, message, writer } = params;

  try {
    const req = buildChatRequest(llm, message);
    logger.info(
      "llm.request",
      "→ openai.chat.completions.create（协议 A · 流式）",
      "记录发往上游的完整请求体：模块 00 最小闭环只有 model + 一条 user + stream 开关，打全便于后续核对字段、排查网关层多塞的参数",
      {
        model: req.model,
        messagesCount: req.messages.length,
        stream: req.stream,
        stream_options: req.stream_options,
        __code: `const stream = await llm.openai.chat.completions.create(${JSON.stringify(req, null, 2)})`,
      },
    );
    const stream = await llm.openai.chat.completions.create(req);
    logger.info(
      "llm.response",
      "← 拿到流对象（AsyncIterable<ChatCompletionChunk>）",
      "完整打响应便于核对 SDK 自带字段（id / object / created / model / choices 首批 / system_fingerprint 等），流模式下 usage 要在最后一帧里取",
      stream,
    );
    const { frameCount, usage } = await pumpChunksToSse(stream, writer);
    writer.done();
    return { frameCount, usage };
  } catch (error: unknown) {
    const failed = describeUpstreamError(error);
    logger.error(
      "llm.error",
      "× openai.chat.completions.create 抛错",
      "上游异常落到这里时 SSE 头已经发出去没法回 HTTP 状态码了，只能以错误帧回页面；upstreamStatus 区分 401/403（Key）、429（限流）、5xx（对方挂了）",
      {
        message: failed.message,
        upstreamStatus: failed.upstreamStatus,
        __code: `// 已在 catch 中调用 writer.frame({ error, upstreamStatus }) + writer.done()`,
      },
    );
    // 错误帧和正常帧走同一条流：页面统一在 onFrame 里判断 obj.error
    writer.frame({ error: failed.message, upstreamStatus: failed.upstreamStatus });
    writer.done();
    return { frameCount: 0, usage: undefined, failed };
  }
}
