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

export async function streamOnceBText(
  llm: Llm,
  body: DemoCallBody,
  res: ServerResponse,
): Promise<void> {
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
    writer.frame({
      type: "content_block_delta",
      delta: { type: "text", text: textDelta },
      accumulated: accumulatedText,
    });
  });

  const finalMessage = await stream.finalMessage();
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
