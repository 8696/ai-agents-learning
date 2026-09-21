/**
 * 本步核心：streamText 把工具循环推成界面消息流，给浏览器里的 useChat 拆帧。
 *
 * 职责：流式 UI 教学点的接入层。复用 framework-chat 的 streamText 核心，
 *       但单独走 /api/chat-stream 这个 URL（和 /api/framework-chat 区分）。
 *
 * 数据流：UIMessage[] → pipeFrameworkChat（同一段 streamText）→ 写到 Node 的 ServerResponse。
 */
import type { ServerResponse } from "node:http";
import type { UIMessage } from "ai";
import { logger } from "../logger.js";
import { pipeFrameworkChat } from "./framework-chat.js";

export async function pipeChatStream(
  messages: UIMessage[],
  response: ServerResponse,
  abortSignal?: AbortSignal,
): Promise<void> {
  const started = Date.now();
  logger.info(
    "chat-stream.flow",
    "开始：pipeChatStream",
    "流式 UI 教学点的接入层：把 useChat 的消息交给 streamText 推 UI 流。",
    {
      入参: { messages },
      __code: "await pipeFrameworkChat(messages, response, abortSignal);",
    }
  );
  await pipeFrameworkChat(messages, response, abortSignal);
  logger.info(
    "chat-stream.flow",
    "结束：pipeChatStream",
    "UI 流已写入响应。",
    {
      耗时ms: Date.now() - started,
      返回值: { streamed: true },
    }
  );
}