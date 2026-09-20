/**
 * 本步核心：streamText 把工具循环推成界面消息流，给浏览器里的 useChat 拆帧。
 *
 * 职责：同一套 make_latte，改成流式吐给 /api/framework-chat。业务文件里没有 while。
 *
 * 数据流：UIMessage[] → convertToModelMessages → streamText → toUIMessageStream → 写到 Node 的 ServerResponse。
 */
import type { ServerResponse } from "node:http";
import {
  convertToModelMessages,
  isStepCount,
  pipeUIMessageStreamToResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { SYSTEM_PROMPT } from "../cafe/cafe-shared.js";
import { createCafeSdkRuntime } from "../cafe/sdk-runtime.js";
import { logger } from "../logger.js";

export async function pipeFrameworkChat(
  messages: UIMessage[],
  response: ServerResponse,
  abortSignal?: AbortSignal,
): Promise<void> {
  const started = Date.now();
  logger.info("pipeFrameworkChat", "调用函数：pipeFrameworkChat", "入口：把 useChat 的消息交给 streamText。", {});
  logger.info("pipeFrameworkChat", "调用函数：pipeFrameworkChat", "记下这一次的消息列表。", {
    入参: { messages },
  });
  logger.info("pipeFrameworkChat", "调用函数：pipeFrameworkChat", "函数体：convertToModelMessages + streamText + 推界面消息流。", {
    __code: pipeFrameworkChat.toString(),
  });

  const { llm, model, tools } = createCafeSdkRuntime();
  const modelMessages = await convertToModelMessages(messages);
  const 入参 = {
    model: llm.modelA,
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools: { make_latte: "tool(make_latte)" },
    stopWhen: "isStepCount(5)",
  };
  logger.info(
    "│ streamText",
    "调用函数：streamText",
    "真发网络请求发生在 AI SDK 内部。推的是界面消息流，不是整段 JSON。",
    { 入参 },
  );

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools,
    stopWhen: isStepCount(5),
    abortSignal,
    onFinish: ({ text, steps }) => {
      logger.info("│ streamText", "结束：streamText", "库把圈转完并推完流。", {
        耗时ms: Date.now() - started,
        返回值: { text, steps },
      });
    },
  });

  await pipeUIMessageStreamToResponse({
    response,
    stream: toUIMessageStream({ stream: result.stream, tools }),
  });
  logger.info("pipeFrameworkChat", "结束：pipeFrameworkChat", "界面消息流已写入 HTTP 响应。", {
    耗时ms: Date.now() - started,
    返回值: { streamed: true },
  });
}
