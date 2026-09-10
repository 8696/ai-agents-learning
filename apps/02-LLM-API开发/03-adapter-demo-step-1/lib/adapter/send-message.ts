/**
 * 职责：adapter 对外入口 —— 业务只调这两个函数，由 protocol 选 A 或 B。
 * 数据流：opts.protocol → protocol-a/* 或 protocol-b/* → UnifiedResponse / UnifiedDelta。
 * 分叉只发生在这里（两行 if），真正碰 SDK 的代码分属两个协议目录（§5.3.13）。
 *
 * 日志（§5.3.16）：调用函数 五条日志（sendMessage / sendMessageStream 封装层，adapter 分叉）；
 *   子调用 sendViaA / sendViaB / sendViaAStream / sendViaBStream 内部已自带五条日志。
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
  const tFuncStart = Date.now();
  logger.info(
    "│ 分叉-sendMessage",
    "调用函数开始：sendMessage",
    "为什么写这条日志：adapter 唯一分叉点；业务层只认 UnifiedResponse，不知道下面走的是 openai 还是 anthropic。当前：即将按 protocol 选 A(openai) 还是 B(anthropic)。",
    {
      入参: { protocol: opts.protocol, mode: "once", systemLen: (opts.system ?? "").length, messageLen: opts.message.length },
      __code: `if (opts.protocol === "A") return sendViaA(llm, opts);\nreturn sendViaB(llm, opts);`,
    },
  );

  const result = opts.protocol === "A" ? await sendViaA(llm, opts) : await sendViaB(llm, opts);

  logger.info(
    "│ 分叉-sendMessage",
    "调用函数结束：sendMessage",
    "为什么写这条日志：route 要把 UnifiedResponse 写进 ctx.body 交给页面；打 usage / stopReason 便于核对「两协议字段差异在 adapter 已经被抹平」。当前：分叉到的协议 sendVia* 已返回。",
    {
      返回值: {
        protocol: result.protocol,
        model: result.model,
        stopReason: result.stopReason,
        usage: result.usage,
        contentLen: result.content.length,
        hasThinking: Boolean(result.thinking),
      },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  return result;
}

export async function* sendMessageStream(
  llm: Llm,
  opts: SendMessageOptions,
): AsyncGenerator<UnifiedDelta> {
  const tFuncStart = Date.now();
  logger.info(
    "│ 分叉-sendMessageStream",
    "调用函数开始：sendMessageStream",
    "为什么写这条日志：adapter 流式分叉点；业务层只认 UnifiedDelta 迭代器。当前：即将按 protocol 选 A(openai) 还是 B(anthropic) 的流句柄。",
    {
      入参: { protocol: opts.protocol, mode: "stream", systemLen: (opts.system ?? "").length, messageLen: opts.message.length },
      __code: `if (opts.protocol === "A") yield* sendViaAStream(llm, opts);\nelse yield* sendViaBStream(llm, opts);`,
    },
  );

  if (opts.protocol === "A") {
    yield* sendViaAStream(llm, opts);
  } else {
    yield* sendViaBStream(llm, opts);
  }
  // 注意：流式场景不在这里打「调用函数结束」——按 §5.3.16 流式规则，
  // sendVia* 内部的「调用模型结束」会写完整返回值；这里只是分叉包装。
  void tFuncStart;
}