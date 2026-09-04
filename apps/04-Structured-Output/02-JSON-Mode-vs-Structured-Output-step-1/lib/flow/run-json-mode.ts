/**
 * 职责：协议 A 的语法闸 —— response_format: { type: "json_object" }。
 * 数据流：{ llm, prompt } → chat.completions.create → raw → parse + analyze → ModeCallResult。
 * 为什么单独成文件：这一刀只保「能 JSON.parse」，不保字段名 / enum。
 *   和 structured 混在一个函数里，读者会以为两个开关只差一个参数。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { ModeCallResult } from "./measure-types.js";
import { analyze, safeParseIntent } from "./parse-and-analyze.js";
import { logger } from "../logger.js";

export async function runJsonMode(llm: Llm, prompt: string): Promise<ModeCallResult> {
  const t0 = performance.now();

  // ① 只有 type: json_object：模型必须吐合法 JSON 字符串，但 schema 仍靠 prompt 软约束。
  const request = {
    model: llm.modelA,
    response_format: { type: "json_object" as const },
    messages: [
      {
        role: "system" as const,
        content:
          "你是一个返回 JSON 的助手。必须返回严格合法的 JSON，对应 { action: 'search'|'order'|'cancel', query: string, qty?: number≥1 }。",
      },
      { role: "user" as const, content: prompt },
    ],
  };
  logger.info(
    "llm.request.json_mode",
    "→ 协议 A json_object 调起",
    "JSON Mode 是语法闸：response_format: json_object 只保「能 JSON.parse」，字段名 / enum 全靠 prompt 软约束；记 model / messagesCount / response_format 便于核对请求结构与排错",
    {
      model: request.model,
      messagesCount: request.messages.length,
      response_format: request.response_format,
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
    },
  );
  const res = await llm.openai.chat.completions.create(request as never);

  logger.info(
    "llm.response.json_mode",
    "← 协议 A json_object 拿到响应",
    "完整打响应便于核对 SDK 自带字段（id / choices / usage / finish_reason），并与后端 Zod 校验结果对照看字段漂移",
    res,
  );

  const raw = res.choices[0]?.message?.content ?? "";
  logger.info(
    "llm.response.json_mode",
    "提取 message.content 作 raw",
    "拿到 content 准备后端 Zod 校验；记录长度便于诊断「模型吐空 / 只吐前缀」类问题",
    { rawLen: raw.length, rawPreview: raw.slice(0, 400) },
  );

  // ② 服务端仍走 Zod：语法闸过了不等于 Intent 对。字段漂移 / enum 自由发挥会在这里露馅。
  const parsedResult = safeParseIntent(raw);

  return {
    mode: "json_object",
    raw,
    parseOk: parsedResult.ok,
    parsed: parsedResult.ok ? parsedResult.data : null,
    parseError: parsedResult.ok ? null : parsedResult.error,
    analysis: analyze(raw, parsedResult, prompt),
    elapsedMs: Math.round(performance.now() - t0),
  };
}
