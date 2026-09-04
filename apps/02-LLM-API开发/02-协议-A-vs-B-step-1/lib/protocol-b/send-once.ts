/**
 * 职责：协议 B 一次性调用 —— 只用 @anthropic-ai/sdk。
 * 数据流：DemoCallBody → messages.create → 原样 JSON / ThinkScenario。
 * 本文件禁止 import openai。
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
  logger.info(
    "llm.request.protocolB",
    "→ anthropic messages.create（一次性）",
    "协议 B 一次性发请求 —— 顶层 system（对照 A 放在 messages[0]）+ thinking/budget/max_tokens 联动（max_tokens 必须 ≥ budget）",
    {
      model: llm.modelB,
      systemAtTopLevel: typeof body.system === "string" && body.system.length > 0,
      maxTokens,
      thinking,
      messagesCount: 1,
      __code: `await llm.anthropic.messages.create({\n  model: ${JSON.stringify(llm.modelB)},\n  system: ${JSON.stringify(body.system ?? null)},\n  max_tokens: ${maxTokens},\n  thinking: ${JSON.stringify(thinking)},\n  messages: [{ role: "user", content: ${JSON.stringify(body.message)} }],\n})`,
    },
  );
  const r = await llm.anthropic.messages.create({
    model: llm.modelB,
    system: body.system,
    max_tokens: maxTokens,
    ...(thinking ? { thinking, temperature: 1 as const } : {}),
    messages: [{ role: "user", content: body.message }],
  });
  logger.info(
    "llm.response.protocolB",
    "← got response（一次性）",
    "完整打响应便于核对 SDK 自带字段（content blocks / usage / stop_reason）和 A 的 choices/usage 对照",
    r,
  );
  return JSON.parse(JSON.stringify(r));
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
  try {
    const plain = await sendOnceB(llm, body, thinking);
    logger.info(
      "llm.compare.protocolB",
      `think-compare ${label}: ok`,
      "协议 B 单条对照场景跑完 —— 打耗时便于和 A 对照",
      { label, thinking, elapsedMs: Math.round(performance.now() - t0) },
    );
    console.log(`[${(t0 / 1000).toFixed(2)}s] think-compare ${label}: ok`);
    return summarizeOnceB(plain, label, thinking);
  } catch (err: unknown) {
    logger.error(
      "llm.compare.protocolB",
      `think-compare ${label}: failed`,
      "协议 B 单条对照场景失败 —— 详细打异常便于排查（max_tokens < budget 这类常见坑）",
      { label, thinking, error: err instanceof Error ? err.message : String(err) },
    );
    console.error(`think-compare ${label}:`, err);
    return scenarioErrorB(label, thinking, err);
  }
}
