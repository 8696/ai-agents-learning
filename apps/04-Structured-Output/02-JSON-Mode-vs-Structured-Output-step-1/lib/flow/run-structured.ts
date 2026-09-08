/**
 * 职责：协议 A 的语义闸 —— response_format.json_schema + strict: true。
 * 数据流：{ llm, prompt } → 带 IntentJsonSchema 的 create → raw → parse + analyze。
 * 为什么单独成文件：strict 是 token-level mask，schema 不合规的 token 写不出来。
 *   和 json_object 并排对照，才能看见「语法闸 vs 语义闸」不是程度差，是位置差。
 *
 * 日志（§5.3.16）：调用函数 五件套（runStructuredOutput 封装层），调用模型 五件套（出网层，含 __code + 字段释义）。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import { IntentJsonSchema } from "../schema/intent.js";
import type { ModeCallResult } from "./measure-types.js";
import { analyze, safeParseIntent } from "./parse-and-analyze.js";
import { logger } from "../logger.js";

export async function runStructuredOutput(
  llm: Llm,
  prompt: string,
): Promise<ModeCallResult> {
  const t0 = performance.now();
  const tFuncStart = Date.now();

  // ① strict: true 才是语义闸。不 strict 时 json_schema 只是软约束，和 JSON Mode 差不多。
  const request = {
    model: llm.modelA,
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "Intent",
        schema: IntentJsonSchema,
        strict: true as const,
      },
    },
    messages: [
      {
        role: "system" as const,
        // 显式含 "JSON"——兼容 DeepSeek 的 A2 prompt-must-contain-json 规则
        content: "请以 JSON 格式返回结构化结果。",
      },
      { role: "user" as const, content: prompt },
    ],
  };

  logger.info(
    "│ 语义闸-runStructuredOutput",
    "调用函数开始：runStructuredOutput",
    "为什么打：route 只认这一层返回的 ModeCallResult；里面那次才是出网（看「调用模型开始：协议A-对话补全」）。当前：Structured Output 是语义闸；strict=true 是 token-level mask。",
    {
      入参: { model: llm.modelA, promptPreview: prompt.slice(0, 60), promptLen: prompt.length },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    "为什么打：本文件唯一的真出网层；不打就没有 raw + usage。当前：即将发出 response_format:json_schema strict:true 请求；strict / schemaName / 字段约束都要打。",
    {
      入参: {
        model: request.model,
        messagesCount: request.messages.length,
        response_format: request.response_format,
      },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
    },
  );

  let res;
  try {
    res = await llm.openai.chat.completions.create(request as never);
    logger.info(
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全",
      "为什么打：真 token-mask 时 raw 几乎总合法 JSON；完整打响应便于核对 finish_reason / usage 等 SDK 字段，并与 json_mode 对照。",
      {
        返回值: {
          id: res.id,
          model: res.model,
          finishReason: res.choices?.[0]?.finish_reason,
          usage: res.usage,
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          "choices[0].finish_reason": "stop=正常 / length=撞 max_tokens",
          usage: "OpenAI 标准 usage 三字段（计费依据）",
        },
      },
    );
  } catch (error: unknown) {
    logger.error(
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全（失败）",
      "为什么打：拿到 upstreamStatus 才能区分 401/403（Key）、429（限流）、5xx；未识别 → 500。当前：create 抛错，route 的 catch 会写统一错误响应。",
      {
        返回值: { message: error instanceof Error ? error.message : String(error) },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    throw error;
  }

  const raw = res.choices[0]?.message?.content ?? "";
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型结束：协议A 对话补全（raw 提取）",
    "为什么打：拿到 content 准备后端 Zod 校验；token-mask 下 raw 几乎总 ✓，记录长度便于核对。",
    {
      返回值: { rawLen: raw.length, rawPreview: raw.slice(0, 400) },
      耗时ms: Date.now() - tModelStart,
    },
  );

  // ② 仍然 Zod：真 token-mask 时这里几乎总是 ✓；软约束网关 silent accept 时这里会 ✗。
  const parsedResult = safeParseIntent(raw);
  const result: ModeCallResult = {
    mode: "json_schema_strict",
    raw,
    parseOk: parsedResult.ok,
    parsed: parsedResult.ok ? parsedResult.data : null,
    parseError: parsedResult.ok ? null : parsedResult.error,
    analysis: analyze(raw, parsedResult, prompt),
    elapsedMs: Math.round(performance.now() - t0),
  };
  logger.info(
    "│ 语义闸-runStructuredOutput",
    "调用函数结束：runStructuredOutput",
    "为什么打：route 要把 ModeCallResult 写进 ctx.body 交给页面 stats 区；打 parseOk / analysis 便于对照「语法闸 vs 语义闸」的差异。",
    {
      返回值: {
        mode: result.mode,
        parseOk: result.parseOk,
        analysis: result.analysis,
        elapsedMs: result.elapsedMs,
      },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  return result;
}