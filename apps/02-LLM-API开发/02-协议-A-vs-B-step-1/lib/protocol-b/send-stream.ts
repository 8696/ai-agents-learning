/**
 * 职责：协议 B 流式（不启用 thinking）—— 文本增量 + 末帧 usage。
 * 数据流：messages.stream → on("text") → content_block_delta → message_stop → [DONE]。
 * 本文件禁止 import openai。给 curl /api/b 用；页面看完整事件走 send-stream-raw。
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
  logger.info(
    "llm.request.protocolB",
    "→ anthropic messages.stream（流式 / 不启用 thinking / 给 curl /api/b 看文本增量）",
    "协议 B 流式（无 thinking）发请求 —— 顶层 system（对照 A 放在 messages[0]）+ on(text) 事件流模式",
    {
      model: llm.modelB,
      systemAtTopLevel: typeof body.system === "string" && body.system.length > 0,
      maxTokens: llm.maxTokensB,
      thinking: null,
      messagesCount: 1,
      __code: `llm.anthropic.messages.stream({\n  model: ${JSON.stringify(llm.modelB)},\n  system: ${JSON.stringify(body.system ?? null)},\n  max_tokens: ${llm.maxTokensB},\n  messages: [{ role: "user", content: ${JSON.stringify(body.message)} }],\n})`,
    },
  );
  console.log(
    `\n[${(performance.now() / 1000).toFixed(2)}s] /api/b: system=${body.system ? "顶层" : "无"}`,
  );

  const stream = llm.anthropic.messages.stream({
    model: llm.modelB,
    system: body.system,
    max_tokens: llm.maxTokensB,
    messages: [{ role: "user", content: body.message }],
  });
  const writer = openSseStream(res);

  let textFrameCount = 0;
  let accumulatedText = "";
  stream.on("text", (textDelta: string) => {
    textFrameCount += 1;
    accumulatedText += textDelta;
    logger.debug(
      "llm.response.protocolB",
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
  logger.info(
    "llm.response.protocolB",
    "← 流式结束",
    "协议 B 流式整轮完成 —— 打 stop_reason / usage / 文本增量次数便于和 A 对照 usage 字段差异（input/output tokens 位置等）",
    {
      textFrameCount,
      stopReason: finalMessage.stop_reason,
      usage: finalMessage.usage,
      accumulatedLength: accumulatedText.length,
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
