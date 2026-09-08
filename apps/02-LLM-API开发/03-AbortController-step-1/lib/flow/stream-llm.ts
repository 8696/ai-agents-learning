/**
 * 职责：三个 abort 场景共用的协议 A 流式拼装 + chunk 拆字段 + AbortError 判定。
 * 数据流：{ llm, message, signal? } → chat.completions.create(stream:true) → 逐 chunk 抽出 delta / usage。
 * 为什么单独成文件：三个 run-* 只差「传不传 signal、何时 abort」，请求体和拆字段必须同一份，
 *   否则对照页上「① 帧数 vs ② 帧数」会因为拆法不一致而比歪。
 *
 * 日志（§5.3.16）：工具档（createChatStream 拼装 + 建流）—— 五件套（含 __code）仍要；
 *   createChatStream 是本 Demo 唯一调 SDK 的入口——记下「signal 是否带」便于事后核对三个场景的差异。
 */
import type { Llm } from "../../../../llm.js";
import type OpenAI from "openai";
import { logger } from "../logger.js";

export type AbortReason = "frames" | "client-close" | "manual";

export type ChunkFields = {
  delta: string;
  usage: unknown;
};

/**
 * 本 Demo 三个端点发出去的请求体完全一样：model + 一条 user 消息 + stream + include_usage。
 * 差别只在第二个参数要不要带 `{ signal }`。
 */
export function buildChatStreamParams(
  llm: Llm,
  message: string,
): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
  return {
    model: llm.modelA,
    messages: [{ role: "user", content: message }],
    stream: true,
    stream_options: { include_usage: true },
  };
}

/**
 * 真正建上游流。signal 有值 = cancel 场景；不传 = full / no-signal。
 * 第二个参数省略而不是传 `{ signal: undefined }`：部分 SDK 会把 undefined 当成「有 signal」，行为不稳。
 */
export async function createChatStream(
  llm: Llm,
  message: string,
  signal?: AbortSignal,
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  const tFuncStart = Date.now();
  const params = buildChatStreamParams(llm, message);

  logger.info(
    "│ 流式拼装-buildChatStreamParams",
    "调用函数开始：buildChatStreamParams",
    "为什么打：三个端点共用同一份请求体；不打就丢了「差只在 signal」这条核心对照。当前：即将拼 chat.completions.create 请求体。",
    {
      入参: { messagePreview: message.slice(0, 80), messageLen: message.length },
      __code: `return { model: llm.modelA, messages: [{ role: "user", content: message }], stream: true, stream_options: { include_usage: true } };`,
    },
  );
  logger.info(
    "│ 流式拼装-buildChatStreamParams",
    "调用函数结束：buildChatStreamParams",
    "为什么打：createChatStream 要把 params 当入参传给 SDK；打返回值便于核对「三场景请求体真的一致」。当前：params 已拼好。",
    {
      返回值: { model: params.model, messagesCount: params.messages.length, stream: params.stream },
      耗时ms: Date.now() - tFuncStart,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么打：本 Demo 唯一的真出网层；不打就没有帧数 / usage。当前：即将发出 stream:true 请求；带不带 signal 决定后面 abort() 能不能传到 SDK。",
    {
      入参: {
        model: params.model,
        messagesCount: params.messages.length,
        stream: params.stream,
        signal: signal ? "已传 AbortSignal" : "未传",
        signalAbortedAtStart: signal?.aborted ?? null,
      },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(params, null, 2)}${signal ? ", { signal }" : ""});`,
    },
  );

  let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  try {
    if (signal) {
      stream = await llm.openai.chat.completions.create(params, { signal });
    } else {
      stream = await llm.openai.chat.completions.create(params);
    }
    logger.info(
      "││ 调用模型-对话补全",
      "调用模型结束：对话补全",
      "为什么打：create 返回 AsyncIterable<ChatCompletionChunk>，不是单一响应对象；记 SDK 调用成功、流已就绪，后续 chunk 在 run-* 里逐帧处理。当前：await 已返回。",
      {
        返回值: {
          streamType: stream && typeof (stream as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function"
            ? "AsyncIterable<ChatCompletionChunk>"
            : typeof stream,
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          streamType: "OpenAI 流式 create 返回 AsyncIterable，不是单一对象",
        },
      },
    );
  } catch (error: unknown) {
    logger.error(
      "││ 调用模型-对话补全",
      "调用模型结束：对话补全（失败）",
      "为什么打：create 可能立刻抛（Key 错 / 网络不通 / signal 已 aborted）。abort 路径这里也会抛 AbortError，由调用方（run-cancel）isAbortError 判别。当前：create 抛错。",
      {
        返回值: { message: error instanceof Error ? error.message : String(error), name: error instanceof Error ? error.name : String(error) },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    throw error;
  }
  return stream;
}

/**
 * 把 SDK chunk 摊成普通对象再取字段。
 * JSON 走一圈是为了拿「页面上能 JSON.stringify 的那份」，不要把 SDK 类实例直接塞进 SSE。
 */
export function readChunkFields(chunk: unknown): ChunkFields {
  const plain = JSON.parse(JSON.stringify(chunk)) as {
    choices?: Array<{ delta?: { content?: string } }>;
    usage?: unknown;
  };
  return {
    delta: plain.choices?.[0]?.delta?.content ?? "",
    usage: plain.usage ?? null,
  };
}

/**
 * abort 有三种长相差不多的错：DOM AbortError、OpenAI APIUserAbortError、message 里带 abort。
 * 漏判任何一种，cancel 页就会把「成功停下来」画成红叉。
 */
export function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "AbortError" ||
    err.constructor.name === "APIUserAbortError" ||
    err.message.toLowerCase().includes("abort")
  );
}

/** 上游失败时页面要同时看到人话和 HTTP 码（401 Key / 429 限流 / 5xx 对方挂了）。 */
export function describeUpstreamError(err: unknown): {
  message: string;
  upstreamStatus?: number;
} {
  const message = err instanceof Error ? err.message : String(err);
  const upstreamStatus =
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : undefined;
  return { message, upstreamStatus };
}