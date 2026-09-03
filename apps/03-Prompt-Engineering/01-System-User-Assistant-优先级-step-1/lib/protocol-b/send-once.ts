/**
 * 职责：协议 B 一次性调用 —— 只用 @anthropic-ai/sdk，system 走顶层字段。
 * 数据流：system + turns → messages.create → 拼 text block → CallResult。
 * 本文件禁止 import openai。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { CallResult, Turn } from "../flow/types.js";

export async function sendViaB(
  llm: Llm,
  system: string | null,
  turns: Turn[],
): Promise<CallResult> {
  const t0 = performance.now();
  const r = await llm.anthropic.messages.create({
    model: llm.modelB,
    // ① B 的 system 是顶层字段，不能塞进 messages；turns 只允许 user/assistant
    system: system ?? undefined,
    max_tokens: llm.maxTokensB,
    messages: turns,
  });
  const t1 = performance.now();
  const plain = JSON.parse(JSON.stringify(r)) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (plain.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  return {
    text,
    usage: {
      input: plain.usage?.input_tokens ?? 0,
      output: plain.usage?.output_tokens ?? 0,
    },
    durationMs: Math.round(t1 - t0),
  };
}
