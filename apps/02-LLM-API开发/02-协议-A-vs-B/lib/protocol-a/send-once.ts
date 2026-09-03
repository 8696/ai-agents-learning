/**
 * 职责：协议 A 一次性调用 —— 只用 openai SDK。
 * 数据流：DemoCallBody → chat.completions.create(stream:false) → 原样 JSON / ThinkScenario。
 * 本文件禁止 import @anthropic-ai/sdk。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { DemoCallBody, ThinkScenario } from "../compare/types.js";
import {
  extractThinkFromProtocolAMessage,
  protocolAExtras,
  type ProtocolADelta,
} from "./think-extract.js";

function aMessages(body: DemoCallBody): Array<{ role: "system" | "user"; content: string }> {
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  // ① system 必须进 messages 数组——这就是和 B「顶层 system」对照的那一刀
  if (body.system) messages.push({ role: "system", content: body.system });
  messages.push({ role: "user", content: body.message });
  return messages;
}

export async function sendOnceA(
  llm: Llm,
  body: DemoCallBody,
  enableThinking: boolean,
): Promise<unknown> {
  const r = await llm.openai.chat.completions.create({
    model: llm.modelA,
    messages: aMessages(body),
    stream: false,
    ...protocolAExtras(enableThinking),
  });
  return JSON.parse(JSON.stringify(r));
}

export function summarizeOnceA(
  plain: unknown,
  label: string,
  thinkingOn: boolean,
): ThinkScenario {
  const rec = plain as {
    choices?: Array<{ message?: ProtocolADelta; finish_reason?: string }>;
    usage?: unknown;
  };
  const message = (rec.choices?.[0]?.message ?? {}) as ProtocolADelta;
  const extracted = extractThinkFromProtocolAMessage(message);
  const thinkingText = extracted.thinking ?? "";
  return {
    scenario: label,
    protocol: "A",
    thinkingParam: thinkingOn ? { type: "adaptive" } : null,
    contentType: "string",
    textAnswer: extracted.answer,
    thinking: {
      exists: thinkingText.length > 0,
      location: extracted.location,
      charCount: thinkingText.length,
      preview: thinkingText.slice(0, 300),
    },
    usage: rec.usage ?? {},
    finishReason: rec.choices?.[0]?.finish_reason ?? null,
    stopReason: null,
  };
}

export function scenarioErrorA(
  label: string,
  thinkingOn: boolean,
  err: unknown,
): ThinkScenario {
  return {
    scenario: label,
    protocol: "A",
    thinkingParam: thinkingOn ? { type: "adaptive" } : null,
    error: err instanceof Error ? err.message : String(err),
  };
}

export async function runThinkScenarioA(
  llm: Llm,
  body: DemoCallBody,
  label: string,
  thinkingOn: boolean,
): Promise<ThinkScenario> {
  const t0 = performance.now();
  try {
    const plain = await sendOnceA(llm, body, thinkingOn);
    console.log(
      `[${(t0 / 1000).toFixed(2)}s] think-compare ${label}: ok`,
    );
    return summarizeOnceA(plain, label, thinkingOn);
  } catch (err: unknown) {
    console.error(`think-compare ${label}:`, err);
    return scenarioErrorA(label, thinkingOn, err);
  }
}

export { aMessages };
