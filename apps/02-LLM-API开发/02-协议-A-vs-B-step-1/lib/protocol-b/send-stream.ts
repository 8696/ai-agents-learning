/**
 * 职责：协议 B 流式（不启用 thinking）—— 文本增量 + 末帧 usage。
 * 数据流：messages.stream → on("text") → content_block_delta → message_stop → [DONE]。
 * 本文件禁止 import openai。给 curl /api/b 用；页面看完整事件走 send-stream-raw。
 *
 * 日志（§5.3.16）：调用函数 五件套（streamOnceBText 封装层），调用模型 五件套（出网层）；
 *   流式规则（§5.3.16）：只在收尾打一次完整返回值，中间 text delta 打 debug。
 */
import { performance } from "node:perf_hooks";
import type { ServerResponse } from "node:http";
import type { Llm } from "../../../../llm.js";
import type { DemoCallBody } from "../compare/types.js";
import { openSseStream } from "../http/sse-writer.js";
import { logger } from "../logger.js";

export async function streamOnceBText(
  llm: Llm,
  body: DemoCallBody,
  res: ServerResponse,
): Promise<void> {
  const tFuncStart = Date.now();
  logger.info(
    "│ 协议B 流式-text",
    "调用函数开始：streamOnceBText",
    "为什么打：route 只认这一层把 B 文本增量写到 res；里面那次才是出网（看「调用模型开始：协议B-消息流」）。当前：即将发 stream，无 thinking。",
    {
      入参: { systemLen: (body.system ?? "").length, messageLen: body.message.length },
      __code: `const stream = llm.anthropic.messages.stream({ ... });\nstream.on("text", textDelta => { ... });\nawait stream.finalMessage();`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议B 消息流",
    "调用模型开始：协议B 消息流",
    "为什么打：本文件唯一的真出网层；不打就没有 textFrameCount / usage / stop_reason。当前：即将发出 messages.stream，system 在顶层、不开 thinking。",
    {
      入参: {
        model: llm.modelB,
        systemAtTopLevel: typeof body.system === "string" && body.system.length > 0,
        maxTokens: llm.maxTokensB,
        thinking: null,
        messagesCount: 1,
      },
      __code: `llm.anthropic.messages.stream({\n  model: ${JSON.stringify(llm.modelB)},\n  system: ${JSON.stringify(body.system ?? null)},\n  max_tokens: ${llm.maxTokensB},\n  messages: [{ role: "user", content: ${JSON.stringify(body.message)} }],\n})`,
    },
  );

  const stream = llm.anthropic.messages.stream({
    model: llm.modelB,
    system: body.system,
    max_tokens: llm.maxTokensB,
    messages: [{ role: "user", content: body.message }],
  });

  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/b: system=${body.system ? "顶层" : "无"}`,
  );
  const writer = openSseStream(res);

  let textFrameCount = 0;
  let accumulatedText = "";
  stream.on("text", (textDelta: string) => {
    textFrameCount += 1;
    accumulatedText += textDelta;
    logger.debug(
      "││ 调用模型-协议B 消息流",
      `← text delta #${textFrameCount}`,
      "协议 B 流式文本增量 —— 打累计长度便于核对是否漏帧",
      { textFrameCount, deltaLength: textDelta.length, accumulatedLength: accumulatedText.length },
    );
    writer.frame({
      type: "content_block_delta",
      delta: { type: "text", text: textDelta },
      accumulated: accumulatedText,
    });
  });

  const finalMessage = await stream.finalMessage();
  // 流式规则（§5.3.16）：只在收尾打一次完整返回值。
  logger.info(
    "││ 调用模型-协议B 消息流",
    "调用模型结束：协议B 消息流",
    "为什么打：流式场景只在收尾打一次完整返回值（stop_reason / usage / 累计文本长度），便于和 A 的 usage 字段对照（input/output tokens 位置差异）。当前：finalMessage 已返回。",
    {
      返回值: {
        textFrameCount,
        accumulatedLength: accumulatedText.length,
        stopReason: finalMessage.stop_reason,
        usage: finalMessage.usage,
      },
      耗时ms: Date.now() - tModelStart,
      字段释义: {
        textFrameCount: "本次流式收到了多少 text 事件（与 A 的 chunk 数量不一定一致）",
        "usage.input_tokens": "输入侧 Token 数（与 A 的 prompt_tokens 对照）",
        "usage.output_tokens": "输出侧 Token 数（与 A 的 completion_tokens 对照）",
      },
    },
  );
  logger.info(
    "│ 协议B 流式-text",
    "调用函数结束：streamOnceBText",
    "为什么打：route 已经把 message_stop + [DONE] 写出，连接关闭；打耗时便于和 A 流式对照。当前：stream 已消费完。",
    {
      返回值: { textFrameCount, accumulatedLength: accumulatedText.length },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  console.log(
    `[${(performance.now() / 1000).toFixed(2)}s] /api/b: 文本增量 ${textFrameCount} 次`,
  );

  writer.frame({
    type: "message_stop",
    stop_reason: finalMessage.stop_reason,
    usage: {
      input_tokens: finalMessage.usage.input_tokens,
      output_tokens: finalMessage.usage.output_tokens,
    },
    accumulated: accumulatedText,
  });
  writer.done();
}