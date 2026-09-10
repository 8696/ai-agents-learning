/**
 * 职责：协议 A 一次性调用 —— 只用 openai SDK，system 放进 messages[]。
 * 数据流：system + turns → chat.completions.create(stream:false) → CallResult。
 * 本文件禁止 import @anthropic-ai/sdk。
 *
 * 日志（§5.3.16）：调用函数 五条日志（sendViaA 封装层），调用模型 五条日志（真正发网络请求的那一层，含 __code + 字段释义）。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { CallResult, Role, Turn } from "../flow/types.js";
import { logger } from "../logger.js";

export async function sendViaA(
  llm: Llm,
  system: string | null,
  turns: Turn[],
): Promise<CallResult> {
  const t0 = performance.now();
  const tFuncStart = Date.now();
  const messages: Array<{ role: Role; content: string }> = [];
  // ① A 没有顶层 system 字段，只能作为 messages 的第一条；不塞就等于没约束
  if (system) messages.push({ role: "system", content: system });
  messages.push(...turns);

  const reqBody = {
    model: llm.modelA,
    messages,
    stream: false,
  };

  logger.info(
    "│ 协议A-sendViaA",
    "调用函数开始：sendViaA",
    "为什么写这条日志：route 只认这一层返回的 CallResult；里面那次才是真发网络请求（看「调用模型开始：协议A-对话补全」）。当前：即将拼请求体；system 进 messages[0] 是 A 的硬约束。",
    {
      入参: {
        model: llm.modelA,
        hasSystem: Boolean(system),
        systemLen: system?.length ?? 0,
        turnsCount: turns.length,
      },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(reqBody, null, 2)});`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    "为什么写这条日志：本文件唯一真正发网络请求的那一层；不写就没有 choices[0].message.content / usage。当前：即将发出 stream:false 请求；system 在 messages[0]。",
    {
      入参: {
        provider: "openai",
        model: reqBody.model,
        messagesCount: reqBody.messages.length,
        stream: reqBody.stream,
        systemInMessages: Boolean(system),
        roleOrder: messages.map((m) => m.role),
      },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(reqBody, null, 2)});`,
    },
  );

  try {
    // openai SDK 的 chat.completions.create 在不指定 stream 时返回 ChatCompletion；
    // 但 TypeScript 类型宽到包含 Stream 联合；日志里只关心字段，统一 as any 简化。
    const r = await llm.openai.chat.completions.create(reqBody) as unknown as {
      id: string;
      model: string;
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: unknown;
    };
    logger.info(
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全",
      "为什么写这条日志：要拿 choices[0].message.content 和 usage（计费依据）。当前：await 已返回。",
      {
        返回值: {
          id: r.id,
          model: r.model,
          choicesCount: r.choices?.length ?? 0,
          contentPreview: r.choices?.[0]?.message?.content?.slice(0, 100),
          usage: r.usage,
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          "choices[0].message.content": "模型返回的正文（写完 system 约束后给出的最终答复）",
          usage: "OpenAI 标准 usage 三字段（计费依据）",
        },
      },
    );
    const t1 = performance.now();
    // SDK 对象不一定可枚举，摊成 plain JSON 再读，避免 usage 读到 undefined
    const plain = JSON.parse(JSON.stringify(r)) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const result: CallResult = {
      text: plain.choices?.[0]?.message?.content ?? "",
      usage: {
        input: plain.usage?.prompt_tokens ?? 0,
        output: plain.usage?.completion_tokens ?? 0,
      },
      durationMs: Math.round(t1 - t0),
    };
    logger.info(
      "│ 协议A-sendViaA",
      "调用函数结束：sendViaA",
      "为什么写这条日志：route 要把 CallResult 写进 ctx.body 交给页面 stats 区，和 sendViaB 并排对照。当前：plain 化 + usage 归一化已完成。",
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
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全（失败）",
      "为什么写这条日志：拿到 upstreamStatus 才能区分 401/403（Key）、429（限流）、5xx。当前：create 抛错，route 的 allSettled 会兜住。",
      {
        返回值: { message: error instanceof Error ? error.message : String(error) },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    throw error;
  }
}