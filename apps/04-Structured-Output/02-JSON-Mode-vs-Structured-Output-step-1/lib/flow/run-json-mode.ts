/**
 * 职责：协议 A 的语法闸 —— response_format: { type: "json_object" }。
 * 数据流：{ llm, prompt } → chat.completions.create → raw → parse + analyze → ModeCallResult。
 * 为什么单独成文件：这一刀只保「能 JSON.parse」，不保字段名 / enum。
 *   和 structured 混在一个函数里，读者会以为两个开关只差一个参数。
 *
 * 日志（§5.3.16）：调用函数 五件套（runJsonMode 封装层），调用模型 五件套（出网层，含 __code + 字段释义）。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { ModeCallResult } from "./measure-types.js";
import { analyze, safeParseIntent } from "./parse-and-analyze.js";
import { logger } from "../logger.js";

export async function runJsonMode(llm: Llm, prompt: string): Promise<ModeCallResult> {
  const t0 = performance.now();
  const tFuncStart = Date.now();

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
    "│ 语法闸-runJsonMode",
    "调用函数开始：runJsonMode",
    "为什么打：route 只认这一层返回的 ModeCallResult；里面那次才是出网（看「调用模型开始：协议A-对话补全」）。当前：JSON Mode 是语法闸；只保「能 JSON.parse」，字段名 / enum 全靠 prompt 软约束。",
    {
      入参: { model: llm.modelA, promptPreview: prompt.slice(0, 60), promptLen: prompt.length },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    "为什么打：本文件唯一的真出网层；不打就没有 raw + usage。当前：即将发出 response_format:json_object 请求；model / messagesCount / response_format 都要打。",
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
      "为什么打：完整打响应便于核对 SDK 自带字段（id / choices / usage / finish_reason），并与后端 Zod 校验结果对照看字段漂移。",
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
    "为什么打：拿到 content 准备后端 Zod 校验；记录长度便于诊断「模型吐空 / 只吐前缀」类问题。",
    {
      返回值: { rawLen: raw.length, rawPreview: raw.slice(0, 400) },
      耗时ms: Date.now() - tModelStart,
      字段释义: {
        rawLen: "返回的 content 长度（0 表示模型吐空）",
      },
    },
  );

  // ② 服务端仍走 Zod：语法闸过了不等于 Intent 对。字段漂移 / enum 自由发挥会在这里露馅。
  const parsedResult = safeParseIntent(raw);
  const result: ModeCallResult = {
    mode: "json_object",
    raw,
    parseOk: parsedResult.ok,
    parsed: parsedResult.ok ? parsedResult.data : null,
    parseError: parsedResult.ok ? null : parsedResult.error,
    analysis: analyze(raw, parsedResult, prompt),
    elapsedMs: Math.round(performance.now() - t0),
  };
  logger.info(
    "│ 语法闸-runJsonMode",
    "调用函数结束：runJsonMode",
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