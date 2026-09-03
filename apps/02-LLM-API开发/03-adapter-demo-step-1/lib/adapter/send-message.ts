/**
 * 职责：adapter 对外入口 —— 业务只调这两个函数，由 protocol 选 A 或 B。
 * 数据流：opts.protocol → protocol-a/* 或 protocol-b/* → UnifiedResponse / UnifiedDelta。
 * 分叉只发生在这里（两行 if），真正碰 SDK 的代码分属两个协议目录（§5.3.13）。
 */
import type { Llm } from "../../../../llm.js";
import type { SendMessageOptions, UnifiedDelta, UnifiedResponse } from "./types.js";
import { sendViaA } from "../protocol-a/send-once.js";
import { sendViaAStream } from "../protocol-a/send-stream.js";
import { sendViaB } from "../protocol-b/send-once.js";
import { sendViaBStream } from "../protocol-b/send-stream.js";

export async function sendMessage(
  llm: Llm,
  opts: SendMessageOptions,
): Promise<UnifiedResponse> {
  if (opts.protocol === "A") return sendViaA(llm, opts);
  return sendViaB(llm, opts);
}

export async function* sendMessageStream(
  llm: Llm,
  opts: SendMessageOptions,
): AsyncGenerator<UnifiedDelta> {
  if (opts.protocol === "A") {
    yield* sendViaAStream(llm, opts);
  } else {
    yield* sendViaBStream(llm, opts);
  }
}
