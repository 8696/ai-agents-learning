/**
 * 职责：协议 B 一次性调用 —— 只用 @anthropic-ai/sdk，system 走顶层字段。
 * 数据流：system + turns → messages.create → 拼 text block → CallResult。
 * 本文件禁止 import openai。
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
  const reqBody = {
    model: llm.modelB,
    // ① B 的 system 是顶层字段，不能塞进 messages；turns 只允许 user/assistant
    system: system ?? undefined,
    max_tokens: llm.maxTokensB,
    messages: turns,
  };
  logger.info(
    "llm.request.protocolB",
    "→ anthropic.messages.create",
    "协议 B 调起 anthropic messages.create；system 是顶层字段（不是 messages 一条）—— 这是 B 跟 A 最关键的差异，必须把整段 request JSON 打进 __code 才能事后核对「system 字段到底有没有塞 / max_tokens 是不是漏了」",
    {
      provider: "anthropic",
      model: llm.modelB,
      messagesCount: turns.length,
      systemInTopLevel: Boolean(system),
      maxTokens: llm.maxTokensB,
      roleOrder: turns.map((m) => m.role),
      __code: JSON.stringify(reqBody, null, 2),
    },
  );

  const r = await llm.anthropic.messages.create(reqBody);
  logger.info(
    "llm.response.protocolB",
    "← got response",
    "完整打响应便于核对 SDK 自带字段（content[].text / usage.input_tokens / output_tokens / stop_reason 等）",
    r,
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
  return {
    text,
    usage: {
      input: plain.usage?.input_tokens ?? 0,
      output: plain.usage?.output_tokens ?? 0,
    },
    durationMs: Math.round(t1 - t0),
  };
}
