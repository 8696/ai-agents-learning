/**
 * 本步核心：streamText 把聊天结果推成界面消息流，给浏览器里的 useChat 拆帧。
 *
 * 职责：system（用户可改）+ messages → streamText。无 tools，所以 stopWhen 不写。
 *
 * 数据流：UIMessage[] → convertToModelMessages → streamText → toUIMessageStream → 写到 Node 的 ServerResponse。
 */
import type { ServerResponse } from "node:http";
import {
  convertToModelMessages,
  pipeUIMessageStreamToResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { DEFAULT_SYSTEM_PROMPT } from "../cafe/cafe-shared.js";
import { createBasicSdkRuntime } from "../cafe/sdk-runtime.js";
import { logger } from "../logger.js";

export async function pipeBasicChat(
  systemIn: string | undefined,
  messages: UIMessage[],
  response: ServerResponse,
  abortSignal?: AbortSignal,
): Promise<void> {
  const started = Date.now();
  const system = (systemIn ?? "").trim() || DEFAULT_SYSTEM_PROMPT;
  logger.info("pipeBasicChat", "调用函数：pipeBasicChat", "入口：把 useChat 的 messages + body.system 交给 streamText。", {});
  logger.info("pipeBasicChat", "调用函数：pipeBasicChat", "记下这一次的系统提示词。", {
    入参: { system },
  });
  logger.info("pipeBasicChat", "调用函数：pipeBasicChat", "记下这一次的消息列表。", {
    入参: { messages },
  });
  logger.info("pipeBasicChat", "调用函数：pipeBasicChat", "函数体：convertToModelMessages + streamText + 推界面消息流。", {
    __code: pipeBasicChat.toString(),
  });

  const { llm, model } = createBasicSdkRuntime();
  const modelMessages = await convertToModelMessages(messages);
  const 入参 = {
    model: llm.modelA,
    system: system,
    messages: modelMessages,
    tools: "（无；不带 make_latte）",
  };
  logger.info(
    "│ streamText",
    "调用函数：streamText",
    "真发网络请求发生在 AI SDK 内部。无工具，所以 stopWhen 不写。",
    { 入参 },
  );

  const result = streamText({
    model,
    system,
    messages: modelMessages,
    abortSignal,
    onFinish: ({ text, finishReason, usage }) => {
      logger.info("│ streamText", "结束：streamText", "库推完了界面消息流。", {
        耗时ms: Date.now() - started,
        返回值: { text, finishReason, usage },
      });
    },
  });

  await pipeUIMessageStreamToResponse({
    response,
    stream: toUIMessageStream({ stream: result.stream }),
  });
  logger.info("pipeBasicChat", "结束：pipeBasicChat", "界面消息流已写入 HTTP 响应。", {
    耗时ms: Date.now() - started,
    返回值: { streamed: true },
  });
}