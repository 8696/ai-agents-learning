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
import { logger } from "../logger.js";

export async function sendMessage(
  llm: Llm,
  opts: SendMessageOptions,
): Promise<UnifiedResponse> {
  logger.info(
    "llm.dispatch.adapter",
    `分叉 → 协议 ${opts.protocol}（一次性）`,
    "adapter 唯一分叉点（两行 if）；业务层看不见 SDK，这里选 A(openai) 还是 B(anthropic)；计数便于核对多协议对比时的调用次数",
    { protocol: opts.protocol, mode: "once" },
  );
  if (opts.protocol === "A") return sendViaA(llm, opts);
  return sendViaB(llm, opts);
}

export async function* sendMessageStream(
  llm: Llm,
  opts: SendMessageOptions,
): AsyncGenerator<UnifiedDelta> {
  logger.info(
    "llm.dispatch.adapter",
    `分叉 → 协议 ${opts.protocol}（流式）`,
    "adapter 唯一分叉点（两行 if）；业务层看不见 SDK，这里选 A(openai) 还是 B(anthropic)；计数便于核对多协议对比时的调用次数",
    { protocol: opts.protocol, mode: "stream" },
  );
  if (opts.protocol === "A") {
    yield* sendViaAStream(llm, opts);
  } else {
    yield* sendViaBStream(llm, opts);
  }
}
