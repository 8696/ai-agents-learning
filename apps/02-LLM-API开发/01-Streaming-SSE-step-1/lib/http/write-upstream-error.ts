/**
 * 职责：把上游 LLM SDK 抛错翻译成「页面能显示的一句话 + HTTP 状态码」。
 *
 * 数据流：unknown err → { message, upstreamStatus? }
 *   SSE 已经开流之后，只能把这份对象写成错误帧，改不了 HTTP 状态码。
 *
 * 为什么单独成文件：route / flow 不要各自 if/else 猜 status；
 *   401/403 是 Key 不对，429 是限流，5xx 才是对方挂了 —— 只打印 message 三种会长得一样。
 */
import OpenAI from "openai";

export function describeUpstreamError(error: unknown): {
  message: string;
  upstreamStatus?: number;
} {
  if (error instanceof OpenAI.APIError) {
    return { message: error.message, upstreamStatus: error.status };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}
