/**
 * 职责：三个 abort 场景共用的协议 A 流式拼装 + chunk 拆字段 + AbortError 判定。
 * 数据流：{ llm, message, signal? } → chat.completions.create(stream:true) → 逐 chunk 抽出 delta / usage。
 * 为什么单独成文件：三个 run-* 只差「传不传 signal、何时 abort」，请求体和拆字段必须同一份，
 *   否则对照页上「① 帧数 vs ② 帧数」会因为拆法不一致而比歪。
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
  const params = buildChatStreamParams(llm, message);

  logger.info(
    "llm.request",
    "→ openai.chat.completions.create (stream:true)",
    "建上游流；带不带 signal 决定后面 abort() 能不能传到 SDK，记下 model + messages 数 + __code 便于核对请求体",
    {
      model: llm.modelA,
      messagesCount: params.messages.length,
      stream: true,
      signal: signal ? "已传 AbortSignal" : "未传",
      signalAbortedAtStart: signal?.aborted ?? null,
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(params, null, 2)}${signal ? ", { signal }" : ""});`,
    },
  );

  let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  if (signal) {
    stream = await llm.openai.chat.completions.create(params, { signal });
  } else {
    stream = await llm.openai.chat.completions.create(params);
  }

  logger.info(
    "llm.response",
    "← got stream iterator",
    "create 返回 AsyncIterable<ChatCompletionChunk>，不是单一响应对象；记 SDK 调用成功、流已就绪，后续 chunk 在 run-* 里逐帧处理",
    {
      model: llm.modelA,
      streamType: "AsyncIterable<ChatCompletionChunk>",
      signal: signal ? "已传 AbortSignal" : "未传",
    },
  );

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
