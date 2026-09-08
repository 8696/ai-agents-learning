/**
 * 职责：协议 B 一次性调用 —— 只用 @anthropic-ai/sdk，system 走顶层字段。
 * 数据流：system + turns → messages.create → 拼 text block → CallResult。
 * 本文件禁止 import openai。
 *
 * 日志（§5.3.16）：调用函数 五件套（sendViaB 封装层），调用模型 五件套（出网层，含 __code + 字段释义）。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { CallResult, Turn } from "../flow/types.js";
import { logger } from "../logger.js";

export async function sendViaB(
  llm: Llm,
  system: string | null,
  turns: Turn[],
): Promise<CallResult> {
  const t0 = performance.now();
  const tFuncStart = Date.now();
  const reqBody = {
    model: llm.modelB,
    // ① B 的 system 是顶层字段，不能塞进 messages；turns 只允许 user/assistant
    system: system ?? undefined,
    max_tokens: llm.maxTokensB,
    messages: turns,
  };

  logger.info(
    "│ 协议B-sendViaB",
    "调用函数开始：sendViaB",
    "为什么打：route 只认这一层返回的 CallResult；里面那次才是出网（看「调用模型开始：协议B-消息创建」）。当前：即将拼请求体；system 是顶层字段（不是 messages 一条）。",
    {
      入参: {
        model: llm.modelB,
        hasSystem: Boolean(system),
        systemLen: system?.length ?? 0,
        turnsCount: turns.length,
        maxTokens: llm.maxTokensB,
      },
      __code: `await llm.anthropic.messages.create(${JSON.stringify(reqBody, null, 2)});`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议B 消息创建",
    "调用模型开始：协议B 消息创建",
    "为什么打：本文件唯一的真出网层；不打就没有 content[] / usage。当前：即将发出 messages.create；system 在顶层、turns 只放 user/assistant。",
    {
      入参: {
        provider: "anthropic",
        model: reqBody.model,
        systemInTopLevel: Boolean(system),
        maxTokens: reqBody.max_tokens,
        messagesCount: reqBody.messages.length,
        roleOrder: turns.map((m) => m.role),
      },
      __code: `await llm.anthropic.messages.create(${JSON.stringify(reqBody, null, 2)});`,
    },
  );

  try {
    const r = await llm.anthropic.messages.create(reqBody);
    logger.info(
      "││ 调用模型-协议B 消息创建",
      "调用模型结束：协议B 消息创建",
      "为什么打：要拿 content[].text / usage.input_tokens / output_tokens / stop_reason。当前：await 已返回。",
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
          "content[].text": "模型返回的正文（type=text 的 block 拼起来）",
          "usage.input_tokens": "输入侧 Token 数（与 A 的 prompt_tokens 对照）",
          "usage.output_tokens": "输出侧 Token 数（与 A 的 completion_tokens 对照）",
        },
      },
    );
    const t1 = performance.now();
    const plain = JSON.parse(JSON.stringify(r)) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (plain.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    const result: CallResult = {
      text,
      usage: {
        input: plain.usage?.input_tokens ?? 0,
        output: plain.usage?.output_tokens ?? 0,
      },
      durationMs: Math.round(t1 - t0),
    };
    logger.info(
      "│ 协议B-sendViaB",
      "调用函数结束：sendViaB",
      "为什么打：route 要把 CallResult 写进 ctx.body 交给页面 stats 区，和 sendViaA 并排对照。当前：text block 拼好 + usage 归一化已完成。",
      {
        返回值: {
          textPreview: result.text.slice(0, 100),
          textLen: result.text.length,
          usage: result.usage,
          durationMs: result.durationMs,
        },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return result;
  } catch (error: unknown) {
    logger.error(
      "││ 调用模型-协议B 消息创建",
      "调用模型结束：协议B 消息创建（失败）",
      "为什么打：拿到 status 才能区分 401/403（Key）、429（限流）、5xx、400（max_tokens 等常见坑）。当前：messages.create 抛错，route 的 allSettled 会兜住。",
      {
        返回值: { message: error instanceof Error ? error.message : String(error) },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    throw error;
  }
}