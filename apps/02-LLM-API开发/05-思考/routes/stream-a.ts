/**
 * 职责：协议 A 的 SSE handler（开流、调 openai 循环、收尾）。
 * 数据流：已校验的 StreamBody + Llm → openSseStream → sendStreamA → [DONE]。
 * 为什么单独成文件：§5.3.13 分叉只允许发生在 route 层；本文件不 import anthropic。
 */
import type { ServerResponse } from "node:http";
import type { Llm } from "../../../llm.js";
import type { StreamBody } from "../lib/compare/stream-types.js";
import { openSseStream } from "../lib/http/sse-writer.js";
import { sendStreamA } from "../lib/protocol-a/send-stream.js";

export async function handleStreamA(
  llm: Llm,
  body: StreamBody,
  res: ServerResponse,
): Promise<void> {
  // ① writeHead 之后就不能再改 HTTP 状态码，上游错误只能塞进 SSE error 帧
  const writer = openSseStream(res);
  try {
    await sendStreamA(llm, body, writer);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    writer.frame({ type: "error", error: msg });
  } finally {
    writer.done();
  }
}
