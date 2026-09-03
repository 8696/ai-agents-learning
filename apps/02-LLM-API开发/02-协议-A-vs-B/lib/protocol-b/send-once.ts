/**
 * 职责：协议 B 一次性调用 —— 只用 @anthropic-ai/sdk。
 * 数据流：DemoCallBody → messages.create → 原样 JSON / ThinkScenario。
 * 本文件禁止 import openai。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { DemoCallBody, ThinkScenario } from "../compare/types.js";

export type BThinkingParam = { type: "enabled"; budget_tokens: number } | null;

export async function sendOnceB(
  llm: Llm,
  body: DemoCallBody,
  thinking: BThinkingParam,
): Promise<unknown> {
  // ① system 放顶层，不进 messages——和 A 的 messages[0].role=system 对照
  // ② thinking 启用时 max_tokens 必须 ≥ budget，否则 SDK / 上游会拒
  const r = await llm.anthropic.messages.create({
    model: llm.modelB,
    system: body.system,
    max_tokens: thinking ? Math.max(thinking.budget_tokens, 2048) : llm.maxTokensB,
    ...(thinking ? { thinking, temperature: 1 as const } : {}),
    messages: [{ role: "user", content: body.message }],
  });
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
    console.log(`[${(t0 / 1000).toFixed(2)}s] think-compare ${label}: ok`);
    return summarizeOnceB(plain, label, thinking);
  } catch (err: unknown) {
    console.error(`think-compare ${label}:`, err);
    return scenarioErrorB(label, thinking, err);
  }
}
