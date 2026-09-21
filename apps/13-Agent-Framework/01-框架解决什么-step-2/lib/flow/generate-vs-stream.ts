/**
 * 本步核心：AI SDK 的 generateText（一次性返回）对照 streamText（流式返回）。
 *
 * 职责：query + provider × protocol + mode → 调 generateText 或 streamText。
 *   - generateText：一次性 await result.text，回 JSON 给浏览器。
 *   - streamText：把 result.stream 转成 UI 消息流，pipeUIMessageStreamToResponse 推流。
 *
 * 数据流：
 *   入口 runGenerateVsStream 按 mode 分两条分支；
 *   route 只校验入参、调这里、捕获错误吐回浏览器，不写业务 while、不直接调模型。
 *
 * 对照 step-2 现有 flow：
 *   - basic-chat.ts：streamText 无 tools，一次流式聊天（多轮 useChat 配套）。
 *   - structured.ts：streamText + Output.object，强约束吐 JSON（流式入口，一次性返回）。
 *   - 本文件：同句 query 对照「一次性」与「流式」两种出口，是 generateText 在 AI SDK 里的标准用法。
 */
import type { ServerResponse } from "node:http";
import {
  convertToModelMessages,
  generateText,
  pipeUIMessageStreamToResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import {
  type ProductionProviderId,
  getLlmForProvider,
} from "../../../../llm.js";
import { createModel, type Protocol } from "../cafe/model.js";
import { logger } from "../logger.js";

export type GenerateVsStreamMode = "generate" | "stream";

export interface GenerateVsStreamArgs {
  providerId: ProductionProviderId;
  protocol: Protocol;
  query?: string;
  messages?: UIMessage[];
  mode: GenerateVsStreamMode;
  response: ServerResponse;
  abortSignal?: AbortSignal;
}

export async function runGenerateVsStream(args: GenerateVsStreamArgs): Promise<void> {
  const { providerId, protocol, query, messages, mode, response, abortSignal } = args;
  const started = Date.now();

  logger.info(
    "runGenerateVsStream",
    "调用函数：runGenerateVsStream",
    "入口：同 provider × 同 protocol × 同 query × 同 model；按 mode 走 generateText 或 streamText。generateText 是一次性 await 完整文本；streamText 是流式推 UI 消息流给浏览器拆帧。",
    {
      字段释义: {
        providerId: "4 家生产环境 provider id（minimax | zhipu | deepseek | qwen）",
        protocol: "协议 A（openai Chat Completions）或 协议 B（anthropic Messages API）",
        query: "generate 模式用：用户原话",
        messages: "stream 模式用：useChat 默认发的 UIMessage[] 数组",
        mode: "generate = generateText 一次性；stream = streamText 流式推 UI 消息流",
      },
      入参: { providerId, protocol, query, messagesLen: messages?.length, mode },
    },
  );
  logger.info("runGenerateVsStream", "调用函数：runGenerateVsStream", "函数体：getLlmForProvider → createModel → 按 mode 分支调 generateText 或 streamText。", {
    __code: runGenerateVsStream.toString(),
  });

  const llm = getLlmForProvider(providerId);
  if (!llm) {
    const msg = `提供商 ${providerId} 没在 apps/.env 配齐 Key / 模型 id。`;
    logger.error("runGenerateVsStream", "结束：runGenerateVsStream（失败）", msg, { 返回值: { message: msg } });
    if (!response.headersSent) {
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }

  // 生成题（无工具 / 无聊天上下文）不需要 reasoning 段——按「无思考」拼模型；minimax 路径不走 extractReasoningMiddleware。
  const model = createModel(providerId, protocol, { useReasoningMiddleware: false });
  const modelId = protocol === "openai" ? llm.modelA : llm.modelB;

  if (mode === "generate") {
    if (!query || !query.trim()) {
      const msg = "generate 模式缺 query 字段或 query 为空。";
      logger.error("runGenerateVsStream", "结束：runGenerateVsStream（失败）", msg, { 返回值: { message: msg } });
      if (!response.headersSent) {
        response.statusCode = 400;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify({ ok: false, error: msg }));
      }
      return;
    }
    const 入参 = {
      modelId,
      protocol,
      providerId,
      prompt: query,
      mode: "generate",
    };
    logger.info("│ generateText", "调用模型：generateText", "AI SDK 里 generateText 是非流式入口：await result.text 拿完整字符串，不推流。", { 入参 });

    try {
      const result = await generateText({
        model,
        prompt: query,
        abortSignal,
      });
      const text = result.text ?? "";
      const charCount = [...text].length;
      const totalMs = Date.now() - started;
      logger.info("│ generateText", "结束：generateText", `完整文本已一次性拿到；字符数 ${charCount}；耗时 ${totalMs} ms。`, {
        耗时ms: totalMs,
        字段释义: {
          text: "模型一次性吐回的完整字符串（不含 reasoning）",
          charCount: "按 Unicode 码点数（不是字节数）",
          finishReason: "AI SDK 的停止原因：stop / length / tool-calls / error / other",
          usage: "token 用量：inputTokens / outputTokens / totalTokens",
        },
        返回值: { text, charCount, finishReason: result.finishReason, usage: result.usage },
      });

      if (!response.headersSent) {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify({
          ok: true,
          mode: "generate",
          provider: providerId,
          protocol,
          modelId,
          text,
          charCount,
          totalMs,
          finishReason: result.finishReason,
          usage: result.usage,
        }));
      }
      logger.info("runGenerateVsStream", "结束：runGenerateVsStream", `mode=generate · JSON 已写回浏览器。`, {
        耗时ms: totalMs,
        返回值: { mode: "generate", streamed: false, bytes: JSON.stringify({ ok: true, text }).length + (charCount > 0 ? text.length : 0) },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("│ generateText", "结束：generateText（失败）", "generateText 抛错。", { 返回值: { message } });
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify({ ok: false, mode: "generate", error: message }));
      } else {
        response.end();
      }
      throw error;
    }
    return;
  }

  // mode === "stream"
  if (!messages || messages.length === 0) {
    const msg = "stream 模式缺 messages 字段（useChat 会自动发 messages 数组；裸 fetch 请按 UIMessage 形状发）。";
    logger.error("runGenerateVsStream", "结束：runGenerateVsStream（失败）", msg, { 返回值: { message: msg } });
    if (!response.headersSent) {
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: msg }));
    }
    return;
  }
  const modelMessages = await convertToModelMessages(messages);
  const 入参 = {
    modelId,
    protocol,
    providerId,
    messagesLen: messages.length,
    messagesRole: messages.map(function (m) { return m.role; }),
    mode: "stream",
  };
  logger.info("│ streamText", "调用模型：streamText", "AI SDK 里 streamText 是流式入口；toUIMessageStream + pipeUIMessageStreamToResponse 把 SDK 协议帧写到 Node 的 ServerResponse。useChat 客户端消费这条流。", { 入参 });

  try {
    const result = streamText({
      model,
      messages: modelMessages,
      abortSignal,
      onError: ({ error }) => {
        logger.error("│ streamText", "结束：streamText（失败）", "把 AI SDK 内部异常原文落日志。", {
          返回值: { error: error instanceof Error ? error.message : String(error) },
        });
      },
      onFinish: ({ text, finishReason, usage }) => {
        logger.info("│ streamText", "结束：streamText", "库推完了 UI 消息流。", {
          耗时ms: Date.now() - started,
          字段释义: {
            text: "流推完后拼回的完整字符串",
            finishReason: "AI SDK 的停止原因：stop / length / tool-calls / error / other",
            usage: "token 用量",
          },
          返回值: { text, finishReason, usage },
        });
      },
    });
    await pipeUIMessageStreamToResponse({
      response,
      stream: toUIMessageStream({ stream: result.stream }),
    });
    logger.info("runGenerateVsStream", "结束：runGenerateVsStream", `mode=stream · UI 消息流已写回浏览器。`, {
      耗时ms: Date.now() - started,
      返回值: { mode: "stream", streamed: true },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("│ streamText", "结束：streamText（失败）", "streamText 抛错。", { 返回值: { message } });
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, mode: "stream", error: message }));
    } else {
      response.end();
    }
    throw error;
  }
}