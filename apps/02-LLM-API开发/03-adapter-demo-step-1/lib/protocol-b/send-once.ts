/**
 * 职责：协议 B 一次性调用 —— 只用 @anthropic-ai/sdk，翻译成 UnifiedResponse。
 * 数据流：SendMessageOptions → messages.create → block[] 拆 text/thinking → UnifiedResponse。
 * 本文件禁止 import openai。
 *
 * 日志（§5.3.16）：调用函数 五件套（sendViaB 封装层），调用模型 五件套（出网层，含 __code + 字段释义）。
 */
import type { Llm } from "../../../../llm.js";
import type { SendMessageOptions, UnifiedResponse } from "../adapter/types.js";
import { thinkingEnabled } from "../adapter/types.js";
import { logger } from "../logger.js";

export async function sendViaB(
  llm: Llm,
  opts: SendMessageOptions,
): Promise<UnifiedResponse> {
  const thinkingOn = thinkingEnabled(opts);
  const thinkingCfg = opts.thinking ?? { type: "enabled" as const, budget_tokens: 1024 };
  const maxTokens = thinkingOn
    ? Math.max(thinkingCfg.budget_tokens + 1024, llm.maxTokensB, 2048)
    : llm.maxTokensB;

  const requestBody = {
    model: llm.modelB,
    system: opts.system,
    max_tokens: maxTokens,
    ...(thinkingOn ? { temperature: 1 as const, thinking: thinkingCfg } : {}),
    messages: [{ role: "user" as const, content: opts.message }],
  };

  const tFuncStart = Date.now();
  logger.info(
    "│ 协议B-sendViaB",
    "调用函数开始：sendViaB",
    "为什么打：sendMessage 只认这一层返回的 UnifiedResponse；里面那次才是出网（看「调用模型开始：协议B-消息创建」）。当前：即将发协议 B 一次性调用；system 在顶层、max_tokens ≥ budget+1024 是 SDK 强约束。",
    {
      入参: { protocol: "B", mode: "once", sdk: "anthropic", hasSystem: Boolean(opts.system), messageLen: opts.message.length, thinkingEnabled: thinkingOn, maxTokens },
      __code: `await llm.anthropic.messages.create(${JSON.stringify(requestBody, null, 2)});`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议B 消息创建",
    "调用模型开始：协议B 消息创建",
    "为什么打：本文件唯一的真出网层；不打就没有 usage / stop_reason。当前：即将发出 messages.create；adapter 已分叉到协议 B。",
    {
      入参: {
        model: requestBody.model,
        systemAtTopLevel: Boolean(opts.system),
        maxTokens,
        thinking: thinkingOn ? thinkingCfg : null,
        messagesCount: 1,
      },
      __code: `await llm.anthropic.messages.create(${JSON.stringify(requestBody, null, 2)});`,
    },
  );

  let r;
  try {
    r = await llm.anthropic.messages.create(requestBody);
    logger.info(
      "││ 调用模型-协议B 消息创建",
      "调用模型结束：协议B 消息创建",
      "为什么打：要拿 stop_reason（end_turn / max_tokens / tool_use）和 usage（input_tokens / output_tokens / cache_read_input_tokens）。当前：await 已返回。",
      {
        返回值: {
          id: r.id,
          model: r.model,
          stopReason: r.stop_reason,
          contentBlockTypes: r.content?.map((b: { type: string }) => b.type),
          usage: r.usage,
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          stop_reason: "end_turn=自然结束 / max_tokens=撞 max_tokens / tool_use=模型想调工具",
          "usage.input_tokens": "输入侧 Token 数（与 A 的 prompt_tokens 对照）",
          "usage.output_tokens": "输出侧 Token 数（与 A 的 completion_tokens 对照）",
          "usage.cache_read_input_tokens": "命中 cache 的 Token 数（adapter 翻译成 unified.usage.cachedTokens）",
          "usage.output_tokens_details.thinking_tokens": "thinking 单独计费的 Token 数",
        },
      },
    );
  } catch (error: unknown) {
    logger.error(
      "││ 调用模型-协议B 消息创建",
      "调用模型结束：协议B 消息创建（失败）",
      "为什么打：拿到 status 才能区分 401/403（Key）、429（限流）、5xx、400（max_tokens < budget 这类常见坑）。当前：messages.create 抛错。",
      {
        返回值: { message: error instanceof Error ? error.message : String(error) },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    throw error;
  }

  const plain = JSON.parse(JSON.stringify(r));
  const blocks: Array<{ type: string; text?: string; thinking?: string }> = plain.content ?? [];
  const textAnswer = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  const thinkingText = blocks
    .filter((b) => b.type === "thinking")
    .map((b) => b.thinking ?? "")
    .join("");
  const u = plain.usage ?? {};

  const unified: UnifiedResponse = {
    content: textAnswer,
    thinking: thinkingText || undefined,
    stopReason: plain.stop_reason ?? "unknown",
    usage: {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
      thinkingTokens: u.output_tokens_details?.thinking_tokens,
      cachedTokens: u.cache_read_input_tokens,
    },
    protocol: "B",
    model: llm.modelB,
  };
  logger.info(
    "│ 协议B-sendViaB",
    "调用函数结束：sendViaB",
    "为什么打：sendMessage 要把 UnifiedResponse 向上传；打返回值便于核对「两协议字段差异在 adapter 已经被抹平」。当前：已完成 protocol-specific → unified 翻译。",
    {
      返回值: {
        protocol: unified.protocol,
        model: unified.model,
        stopReason: unified.stopReason,
        usage: unified.usage,
        contentLen: unified.content.length,
        hasThinking: Boolean(unified.thinking),
      },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  return unified;
}