/**
 * 职责：协议 A 一次性调用 —— 只用 openai SDK，system 放进 messages[]。
 * 数据流：system + turns → chat.completions.create(stream:false) → CallResult。
 * 本文件禁止 import @anthropic-ai/sdk。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { CallResult, Role, Turn } from "../flow/types.js";

export async function sendViaA(
  llm: Llm,
  system: string | null,
  turns: Turn[],
): Promise<CallResult> {
  const t0 = performance.now();
  const messages: Array<{ role: Role; content: string }> = [];
  // ① A 没有顶层 system 字段，只能作为 messages 的第一条；不塞就等于没约束
  if (system) messages.push({ role: "system", content: system });
  messages.push(...turns);

  const r = await llm.openai.chat.completions.create({
    model: llm.modelA,
    messages,
    stream: false,
  });
  const t1 = performance.now();
  // SDK 对象不一定可枚举，摊成 plain JSON 再读，避免 usage 读到 undefined
  const plain = JSON.parse(JSON.stringify(r)) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: plain.choices?.[0]?.message?.content ?? "",
    usage: {
      input: plain.usage?.prompt_tokens ?? 0,
      output: plain.usage?.completion_tokens ?? 0,
    },
    durationMs: Math.round(t1 - t0),
  };
}
