/**
 * 职责：协议 A 的语义闸 —— response_format.json_schema + strict: true。
 * 数据流：{ llm, prompt } → 带 IntentJsonSchema 的 create → raw → parse + analyze。
 * 为什么单独成文件：strict 是 token-level mask，schema 不合规的 token 写不出来。
 *   和 json_object 并排对照，才能看见「语法闸 vs 语义闸」不是程度差，是位置差。
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
    "llm.request.structured",
    "→ 协议 A json_schema strict 调起",
    "Structured Output 是语义闸：strict=true 是 token-level mask，模型写不出违反 schema 的 token；记 strict / schemaName / 字段约束便于核对请求结构与排查「不 strict 时只软约束」类问题",
    {
      model: request.model,
      messagesCount: request.messages.length,
      response_format: request.response_format,
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
    },
  );
  const res = await llm.openai.chat.completions.create(request as never);

  logger.info(
    "llm.response.structured",
    "← 协议 A json_schema strict 拿到响应",
    "真 token-mask 时 raw 几乎总合法 JSON；完整打响应便于核对 finish_reason / usage 等 SDK 字段，并与 json_mode 对照",
    res,
  );

  const raw = res.choices[0]?.message?.content ?? "";
  logger.info(
    "llm.response.structured",
    "提取 message.content 作 raw",
    "拿到 content 准备后端 Zod 校验；token-mask 下 raw 几乎总 ✓，记录长度便于核对",
    { rawLen: raw.length, rawPreview: raw.slice(0, 400) },
  );

  // ② 仍然 Zod：真 token-mask 时这里几乎总是 ✓；软约束网关 silent accept 时这里会 ✗。
  const parsedResult = safeParseIntent(raw);

  return {
    mode: "json_schema_strict",
    raw,
    parseOk: parsedResult.ok,
    parsed: parsedResult.ok ? parsedResult.data : null,
    parseError: parsedResult.ok ? null : parsedResult.error,
    analysis: analyze(raw, parsedResult, prompt),
    elapsedMs: Math.round(performance.now() - t0),
  };
}
