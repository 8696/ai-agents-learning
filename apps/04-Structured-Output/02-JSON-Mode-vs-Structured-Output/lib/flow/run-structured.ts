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

export async function runStructuredOutput(
  llm: Llm,
  prompt: string,
): Promise<ModeCallResult> {
  const t0 = performance.now();

  // ① strict: true 才是语义闸。不 strict 时 json_schema 只是软约束，和 JSON Mode 差不多。
  const res = await llm.openai.chat.completions.create({
    model: llm.modelA,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "Intent",
        schema: IntentJsonSchema,
        strict: true,
      },
    },
    messages: [
      {
        role: "system",
        // 显式含 "JSON"——兼容 DeepSeek 的 A2 prompt-must-contain-json 规则
        content: "请以 JSON 格式返回结构化结果。",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = res.choices[0]?.message?.content ?? "";
  console.log(
    `  /api/structured-output raw: ${raw.slice(0, 400)}${raw.length > 400 ? "..." : ""}`,
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
