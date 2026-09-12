/**
 * 职责：协议 B 的「JSON Mode 等价路径」——无 tools，纯文本 + prompt 强约束。
 * 数据流：{ llm, prompt } → anthropic.messages.create（不带 tools）→ 拼 text 块 → parse。
 * 为什么单独成文件：协议 B 没有 response_format。这一步只能靠 prompt，
 *   和 tool-use 混在一个函数里，读者会以为 Anthropic 也有 json_object 开关。
 *
 * 日志（§5.3.16）：调用函数 五条日志（runTextNoTools 封装层），调用模型 五条日志（真正发网络请求的那一层，含 __code + 字段释义）。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { ModeCallResult } from "./measure-types.js";
import { analyze, safeParseIntent } from "./parse-and-analyze.js";
import { logger } from "../logger.js";

export async function runTextNoTools(llm: Llm, prompt: string): Promise<ModeCallResult> {
  const t0 = performance.now();
  const tFuncStart = Date.now();

  // ① 没有 tools：模型只能吐纯文本。JSON 合法性全靠这段 prompt，没有 API 字段保。
  const requestBody = {
    model: llm.modelB,
    max_tokens: llm.maxTokensB,
    messages: [
      {
        role: "user" as const,
        content:
          `${prompt}\n\n` +
          `只返回一个合法 JSON 对象，结构 { action: "search"|"order"|"cancel", query: string, qty?: number }。` +
          `不要 markdown fence，不要解释，不要前缀。`,
      },
    ],
  };

  logger.info(
    "│ 无 tools-runTextNoTools",
    "调用函数开始：runTextNoTools",
    "为什么写这条日志：route 只认这一层返回的 ModeCallResult；里面那次才是真发网络请求（看「调用模型开始：协议B-消息创建」）。当前：协议 B 没有 response_format 开关；这是「JSON Mode 等价路径」，全靠 prompt 强约束。",
    {
      入参: { model: llm.modelB, promptPreview: prompt.slice(0, 60), promptLen: prompt.length },
      __code: `await llm.anthropic.messages.create(${JSON.stringify(requestBody, null, 2)});`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议B 消息创建",
    "调用模型开始：协议B 消息创建",
    "为什么写这条日志：本文件唯一真正发网络请求的那一层；不写就没有 raw + usage。当前：即将发出无 tools 的 messages.create；model / max_tokens / messages 拼接（prompt + 结构指令 + 字段说明）都要写。",
    {
      入参: {
        provider: llm.provider,
        baseUrlB: llm.baseUrlB,
        model: requestBody.model,
        maxTokens: requestBody.max_tokens,
        messagesCount: requestBody.messages.length,
        hasTools: false,
        toolChoice: null,
        inputSchema: null,
        promptPreview: prompt.slice(0, 200),
      },
      __code: JSON.stringify(requestBody, null, 2),
    },
  );

  let res;
  try {
    res = await llm.anthropic.messages.create(requestBody);
    logger.info(
      "││ 调用模型-协议B 消息创建",
      "调用模型结束：协议B 消息创建",
      "为什么写这条日志：完整写响应便于核对 SDK 自带字段：stop_reason / model / content[]（注意：text 路径模型可能夹 markdown fence / think 块，剥壳在 safeParseIntent）；同时打 usage 便于对照 token 损耗。",
      {
        返回值: {
          id: res.id,
          model: res.model,
          stopReason: res.stop_reason,
          contentBlockTypes: res.content?.map((b: { type: string }) => b.type),
          usage: res.usage,
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          stop_reason: "end_turn=自然结束 / max_tokens=撞 max_tokens / tool_use=模型想调工具",
          "usage.input_tokens": "输入侧 Token 数（计费依据）",
          "usage.output_tokens": "输出侧 Token 数（计费依据）",
        },
      },
    );
  } catch (error: unknown) {
    logger.error(
      "││ 调用模型-协议B 消息创建",
      "调用模型结束：协议B 消息创建（失败）",
      "为什么写这条日志：拿到 status 才能区分 401/403（Key）、429（限流）、5xx；未识别 → 500。当前：create 抛错，route 的 catch 会写统一错误响应。",
      {
        返回值: { message: error instanceof Error ? error.message : String(error) },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    throw error;
  }

  // ② 协议 B 响应 shape: content: ContentBlock[]。用 for-of 让 discriminated union 收窄。
  let raw = "";
  for (const block of res.content) {
    if (block.type === "text") raw += block.text;
  }
  console.log(`  /api/text raw: ${raw.slice(0, 400)}${raw.length > 400 ? "..." : ""}`);

  const parsedResult = safeParseIntent(raw);
  const result: ModeCallResult = {
    mode: "text_no_tools",
    raw,
    parseOk: parsedResult.ok,
    parsed: parsedResult.ok ? parsedResult.data : null,
    parseError: parsedResult.ok ? null : parsedResult.error,
    analysis: analyze(raw, parsedResult, prompt),
    elapsedMs: Math.round(performance.now() - t0),
  };
  logger.info(
    "│ 无 tools-runTextNoTools",
    "调用函数结束：runTextNoTools",
    "为什么写这条日志：route 要把 ModeCallResult 写进 ctx.body 交给页面 stats 区；打 parseOk / analysis 便于和 tool-use 对照「prompt 软约束 vs input_schema 倾向」的差异。",
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