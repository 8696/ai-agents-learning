/**
 * 职责：协议 B 一次性调用 —— 只用 @anthropic-ai/sdk。
 * 数据流：DemoCallBody → messages.create → 原样 JSON / ThinkScenario。
 * 本文件禁止 import openai。
 *
 * 日志（§5.3.16）：调用函数 五件套（sendOnceB / runThinkScenarioB 封装层），调用模型 五件套（出网层，含 __code + 字段释义）。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { DemoCallBody, ThinkScenario } from "../compare/types.js";
import { logger } from "../logger.js";

export type BThinkingParam = { type: "enabled"; budget_tokens: number } | null;

export async function sendOnceB(
  llm: Llm,
  body: DemoCallBody,
  thinking: BThinkingParam,
): Promise<unknown> {
  // ① system 放顶层，不进 messages——和 A 的 messages[0].role=system 对照
  // ② thinking 启用时 max_tokens 必须 ≥ budget，否则 SDK / 上游会拒
  const maxTokens = thinking ? Math.max(thinking.budget_tokens, 2048) : llm.maxTokensB;

  const tFuncStart = Date.now();
  logger.info(
    "│ 协议B 一次性-sendOnceB",
    "调用函数开始：sendOnceB",
    "为什么打：runThinkScenarioB 只认这一层返回的 plain；里面那次才是出网（看「调用模型开始：协议B-消息创建」）。当前：即将发协议 B 一次性调用；system 不进 messages（与 A 对照）。",
    {
      入参: {
        systemLen: (body.system ?? "").length,
        messageLen: body.message.length,
        thinking,
        maxTokens,
      },
      __code: `await llm.anthropic.messages.create({\n  model: ${JSON.stringify(llm.modelB)},\n  system: ${JSON.stringify(body.system ?? null)},\n  max_tokens: ${maxTokens},\n  thinking: ${JSON.stringify(thinking)},\n  messages: [{ role: "user", content: ${JSON.stringify(body.message)} }],\n})`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议B 消息创建",
    "调用模型开始：协议B 消息创建",
    "为什么打：本条唯一的协议 B 真出网层；不打就没有 usage / stop_reason。当前：即将发出 messages.create，system 在顶层、thinking 若开启则 max_tokens ≥ budget。",
    {
      入参: {
        model: llm.modelB,
        systemAtTopLevel: typeof body.system === "string" && body.system.length > 0,
        maxTokens,
        thinking,
        messagesCount: 1,
      },
      __code: `await llm.anthropic.messages.create({\n  model: ${JSON.stringify(llm.modelB)},\n  system: ${JSON.stringify(body.system ?? null)},\n  max_tokens: ${maxTokens},\n  thinking: ${JSON.stringify(thinking)},\n  messages: [{ role: "user", content: ${JSON.stringify(body.message)} }],\n})`,
    },
  );

  try {
    const r = await llm.anthropic.messages.create({
      model: llm.modelB,
      system: body.system,
      max_tokens: maxTokens,
      ...(thinking ? { thinking, temperature: 1 as const } : {}),
      messages: [{ role: "user", content: body.message }],
    });
    logger.info(
      "││ 调用模型-协议B 消息创建",
      "调用模型结束：协议B 消息创建",
      "为什么打：要拿 stop_reason（end_turn / max_tokens / tool_use）和 usage（input_tokens / output_tokens）。当前：await 已返回。",
      {
        返回值: {
          id: r.id,
          model: r.model,
          stopReason: r.stop_reason,
          contentBlocks: r.content?.map((b: { type: string }) => b.type),
          usage: r.usage,
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          stop_reason: "end_turn=自然结束 / max_tokens=撞 max_tokens / tool_use=模型想调工具",
          "usage.input_tokens": "输入侧 Token 数（与 A 的 prompt_tokens 对照）",
          "usage.output_tokens": "输出侧 Token 数（与 A 的 completion_tokens 对照）",
        },
      },
    );
    const plain = JSON.parse(JSON.stringify(r));
    logger.info(
      "│ 协议B 一次性-sendOnceB",
      "调用函数结束：sendOnceB",
      "为什么打：summarizeOnceB 要把 plain 转 ThinkScenario；plain 形状丢了就无法对齐对照页。当前：已 plain 化。",
      {
        返回值: { plainKeys: Object.keys(plain as object).slice(0, 10) },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return plain;
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
}

export function summarizeOnceB(
  plain: unknown,
  label: string,
  thinking: BThinkingParam,
): ThinkScenario {
  const rec = plain as {
    content?: Array<{ type: string; text?: string; thinking?: string }>;
    usage?: unknown;
    stop_reason?: string | null;
  };
  const blocks = rec.content ?? [];
  const textAnswer = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  const thinkingText = blocks
    .filter((b) => b.type === "thinking")
    .map((b) => b.thinking ?? "")
    .join("");
  const thinkingBlocks = blocks.filter((b) => b.type === "thinking");
  return {
    scenario: label,
    protocol: "B",
    thinkingParam: thinking,
    contentType: "block_array",
    textAnswer,
    thinking: {
      exists: thinkingBlocks.length > 0,
      location: thinkingBlocks.length > 0 ? "separate_block" : "none",
      charCount: thinkingText.length,
      preview: thinkingText.slice(0, 300),
    },
    usage: rec.usage ?? {},
    finishReason: null,
    stopReason: rec.stop_reason ?? null,
  };
}

export function scenarioErrorB(
  label: string,
  thinking: BThinkingParam,
  err: unknown,
): ThinkScenario {
  return {
    scenario: label,
    protocol: "B",
    thinkingParam: thinking,
    error: err instanceof Error ? err.message : String(err),
  };
}

export async function runThinkScenarioB(
  llm: Llm,
  body: DemoCallBody,
  label: string,
  thinking: BThinkingParam,
): Promise<ThinkScenario> {
  const t0 = performance.now();
  const tFuncStart = Date.now();
  logger.info(
    "│ 单条对照-runThinkScenarioB",
    "调用函数开始：runThinkScenarioB",
    "为什么打：think-compare 路由要这一层返回 ThinkScenario；里面 sendOnceB 是「真活」。当前：即将发协议 B 一次性调用。",
    {
      入参: { label, thinking },
      __code: `const plain = await sendOnceB(llm, body, thinking);\nreturn summarizeOnceB(plain, label, thinking);`,
    },
  );

  try {
    const plain = await sendOnceB(llm, body, thinking);
    const scenario = summarizeOnceB(plain, label, thinking);
    logger.info(
      "│ 单条对照-runThinkScenarioB",
      "调用函数结束：runThinkScenarioB",
      "为什么打：think-compare 要把 ThinkScenario 数组写进 ctx.body；打耗时便于和协议 A 对照。当前：summarizeOnceB 已返回。",
      {
        返回值: { scenario: { label: scenario.scenario, protocol: scenario.protocol, error: scenario.error ?? null } },
        耗时ms: Date.now() - tFuncStart,
        字段释义: {
          protocol: "B（Anthropic Messages）",
        },
      },
    );
    console.log(`[${(t0 / 1000).toFixed(2)}s] think-compare ${label}: ok`);
    return scenario;
  } catch (err: unknown) {
    logger.error(
      "│ 单条对照-runThinkScenarioB",
      "调用函数结束：runThinkScenarioB（失败）",
      "为什么打：协议 B 失败也要按 ThinkScenario 形状回收，便于 think-compare 路由并排展示；记 err.message / err。当前：sendOnceB 抛错，已转 scenarioErrorB。",
      {
        返回值: { label, protocol: "B", error: err instanceof Error ? err.message : String(err) },
        耗时ms: Date.now() - tFuncStart,
        错误: err,
      },
    );
    console.error(`think-compare ${label}:`, err);
    return scenarioErrorB(label, thinking, err);
  }
}