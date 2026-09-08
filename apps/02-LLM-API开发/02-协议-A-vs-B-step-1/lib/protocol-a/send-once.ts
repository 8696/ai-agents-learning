/**
 * 职责：协议 A 一次性调用 —— 只用 openai SDK。
 * 数据流：DemoCallBody → chat.completions.create(stream:false) → 原样 JSON / ThinkScenario。
 * 本文件禁止 import @anthropic-ai/sdk。
 *
 * 日志（§5.3.16）：调用函数 五件套（sendOnceA / runThinkScenarioA 封装层），调用模型 五件套（出网层，含 __code + 字段释义）。
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

  const tFuncStart = Date.now();
  logger.info(
    "│ 协议A 一次性-sendOnceA",
    "调用函数开始：sendOnceA",
    "为什么打：runThinkScenarioA 只认这一层返回的 plain；里面那次才是出网（看「调用模型开始：协议A-对话补全」）。当前：即将发一次性请求；system 进 messages[0]、extras 是否带 thinking 是本条对照轴。",
    {
      入参: { systemLen: (body.system ?? "").length, messageLen: body.message.length, enableThinking },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(requestPayload, null, 2)})`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    "为什么打：本条唯一的协议 A 真出网层；不打就没有 usage / finish_reason。当前：即将发出 stream:false 请求，system 进 messages[0]。",
    {
      入参: {
        model: requestPayload.model,
        messagesCount: requestPayload.messages.length,
        stream: requestPayload.stream,
        extras: extras as Record<string, unknown>,
      },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(requestPayload, null, 2)})`,
    },
  );

  try {
    const r = await llm.openai.chat.completions.create(requestPayload);
    logger.info(
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全",
      "为什么打：要拿 choices[0].finish_reason 区分 stop / length / content_filter；usage 是计费的唯一依据。当前：await 已返回。",
      {
        返回值: {
          id: r.id,
          model: r.model,
          choicesCount: r.choices?.length ?? 0,
          finishReason: r.choices?.[0]?.finish_reason,
          usage: r.usage,
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          "choices[0].finish_reason": "stop=正常 / length=撞 max_tokens / content_filter=策略拦下",
          usage: "OpenAI 标准 usage（prompt_tokens / completion_tokens / total_tokens）",
        },
      },
    );
    const plain = JSON.parse(JSON.stringify(r));
    logger.info(
      "│ 协议A 一次性-sendOnceA",
      "调用函数结束：sendOnceA",
      "为什么打：summarizeOnceA 要把 plain 转 ThinkScenario；plain 形状丢了就无法对齐对照页。当前：已 plain 化。",
      {
        返回值: { plainKeys: Object.keys(plain as object).slice(0, 10) },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return plain;
  } catch (error: unknown) {
    logger.error(
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全（失败）",
      "为什么打：拿到 upstreamStatus 才能区分 401/403（Key）、429（限流）、5xx（对方挂了）。当前：create 抛错，runThinkScenarioA 的 catch 会转成 scenarioErrorA。",
      {
        返回值: { message: error instanceof Error ? error.message : String(error) },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    throw error;
  }
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
  const tFuncStart = Date.now();
  logger.info(
    "│ 单条对照-runThinkScenarioA",
    "调用函数开始：runThinkScenarioA",
    "为什么打：think-compare 路由要这一层返回 ThinkScenario；里面 sendOnceA 是「真活」。当前：即将发协议 A 一次性调用。",
    {
      入参: { label, thinkingOn },
      __code: `const plain = await sendOnceA(llm, body, thinkingOn);\nreturn summarizeOnceA(plain, label, thinkingOn);`,
    },
  );

  try {
    const plain = await sendOnceA(llm, body, thinkingOn);
    const scenario = summarizeOnceA(plain, label, thinkingOn);
    logger.info(
      "│ 单条对照-runThinkScenarioA",
      "调用函数结束：runThinkScenarioA",
      "为什么打：think-compare 要把 ThinkScenario 数组写进 ctx.body；打耗时便于和协议 B 对照。当前：summarizeOnceA 已返回。",
      {
        返回值: { scenario: { label: scenario.scenario, protocol: scenario.protocol, error: scenario.error ?? null } },
        耗时ms: Date.now() - tFuncStart,
        字段释义: {
          protocol: "A（OpenAI Chat Completions）",
        },
      },
    );
    console.log(
      `[${(t0 / 1000).toFixed(2)}s] think-compare ${label}: ok`,
    );
    return scenario;
  } catch (err: unknown) {
    logger.error(
      "│ 单条对照-runThinkScenarioA",
      "调用函数结束：runThinkScenarioA（失败）",
      "为什么打：协议 A 失败也要按 ThinkScenario 形状回收，便于 think-compare 路由并排展示；记 err.message / err 当前：sendOnceA 抛错，已转 scenarioErrorA。",
      {
        返回值: { label, protocol: "A", error: err instanceof Error ? err.message : String(err) },
        耗时ms: Date.now() - tFuncStart,
        错误: err,
      },
    );
    console.error(`think-compare ${label}:`, err);
    return scenarioErrorA(label, thinkingOn, err);
  }
}

export { aMessages };