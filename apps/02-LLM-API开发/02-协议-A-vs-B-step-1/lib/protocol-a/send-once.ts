/**
 * 职责：协议 A 一次性调用 —— 只用 openai SDK。
 * 数据流：DemoCallBody → chat.completions.create(stream:false) → 原样 JSON / ThinkScenario。
 * 本文件禁止 import @anthropic-ai/sdk。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { DemoCallBody, ThinkScenario } from "../compare/types.js";
import { logger } from "../logger.js";
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
  const messages = aMessages(body);
  const extras = protocolAExtras(enableThinking);
  const requestPayload = {
    model: llm.modelA,
    messages,
    stream: false as const,
    ...extras,
  };
  logger.info(
    "llm.request.protocolA",
    "→ openai chat.completions.create（一次性 / stream:false）",
    "协议 A 一次性调用发请求 —— 详细打 model / messages 长度 / 是否开 thinking（extras）便于回看请求体差异",
    {
      model: llm.modelA,
      messagesCount: messages.length,
      stream: false,
      enableThinking,
      extras: extras as Record<string, unknown>,
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(requestPayload, null, 2)})`,
    },
  );
  const r = await llm.openai.chat.completions.create(requestPayload);
  logger.info(
    "llm.response.protocolA",
    "← got response（一次性）",
    "完整打响应便于核对 SDK 自带字段（choices / usage / reasoning 字段等）",
    r,
  );
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
    logger.info(
      "llm.compare.protocolA",
      `think-compare ${label}: ok`,
      "协议 A 单条对照场景跑完 —— 打耗时便于和 B 对照",
      { label, thinkingOn, elapsedMs: Math.round(performance.now() - t0) },
    );
    console.log(
      `[${(t0 / 1000).toFixed(2)}s] think-compare ${label}: ok`,
    );
    return summarizeOnceA(plain, label, thinkingOn);
  } catch (err: unknown) {
    logger.error(
      "llm.compare.protocolA",
      `think-compare ${label}: failed`,
      "协议 A 单条对照场景失败 —— 详细打异常便于排查（请求体 / SDK 错误码）",
      { label, thinkingOn, error: err instanceof Error ? err.message : String(err) },
    );
    console.error(`think-compare ${label}:`, err);
    return scenarioErrorA(label, thinkingOn, err);
  }
}

export { aMessages };
