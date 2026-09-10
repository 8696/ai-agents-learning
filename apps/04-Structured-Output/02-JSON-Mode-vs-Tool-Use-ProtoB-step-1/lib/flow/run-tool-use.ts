/**
 * 职责：协议 B 的「Structured Output 等价路径」——强制 tool_choice 调 Intent。
 * 数据流：{ llm, prompt } → tools + tool_choice → content[type=tool_use].input → Zod。
 * 为什么单独成文件：input 已经是对象，无须 JSON.parse。这是和协议 A content 字符串最大的差别。
 *
 * 日志（§5.3.16）：调用函数 五条日志（runToolUseForced 封装层），调用模型 五条日志（真正发网络请求的那一层，含 __code + 字段释义）。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import { INTENT_TOOL } from "../schema/intent.js";
import type { ModeCallResult, ToolUseMeta } from "./measure-types.js";
import { analyzeObject, safeParseIntentObject } from "./parse-and-analyze.js";
import { logger } from "../logger.js";

export async function runToolUseForced(llm: Llm, prompt: string): Promise<ModeCallResult> {
  const t0 = performance.now();
  const tFuncStart = Date.now();

  const requestBody = {
    model: llm.modelB,
    max_tokens: llm.maxTokensB,
    system: "按用户的意图返回结构化结果。遇到模糊请求，从工具描述里的三类动作中选最贴近的。",
    tools: [INTENT_TOOL],
    // ① tool_choice 强制必须调 "Intent"——这是协议 B 的语义闸（没有 token-mask）。
    tool_choice: { type: "tool" as const, name: "Intent" },
    messages: [{ role: "user" as const, content: prompt }],
  };

  logger.info(
    "│ 强制 tool_choice-runToolUseForced",
    "调用函数开始：runToolUseForced",
    "为什么写这条日志：route 只认这一层返回的 ModeCallResult；里面那次才是真发网络请求（看「调用模型开始：协议B-消息创建」）。当前：协议 B 的「Structured Output 等价路径」；用 tools + input_schema + tool_choice.type=tool 强制模型调 Intent，input 由 SDK 解析为对象。",
    {
      入参: { model: llm.modelB, promptPreview: prompt.slice(0, 60), promptLen: prompt.length },
      __code: `await llm.anthropic.messages.create(${JSON.stringify(requestBody, null, 2)});`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议B 消息创建",
    "调用模型开始：协议B 消息创建",
    "为什么写这条日志：本文件唯一真正发网络请求的那一层；不写就没有 input 解析。当前：即将发出 tools + tool_choice 强制 messages.create；system / tools[].input_schema / tool_choice 三个关键字段都要写。",
    {
      入参: {
        provider: llm.provider,
        baseUrlB: llm.baseUrlB,
        model: requestBody.model,
        maxTokens: requestBody.max_tokens,
        messagesCount: requestBody.messages.length,
        hasTools: true,
        tools: [{ name: INTENT_TOOL.name, input_schema: INTENT_TOOL.input_schema }],
        toolChoice: requestBody.tool_choice,
        inputSchema: INTENT_TOOL.input_schema,
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
      "为什么写这条日志：完整写响应便于核对 SDK 自带字段：stop_reason / model / content[type=tool_use].input（已是对象，不是字符串）；同时打 usage 便于对照 token 损耗（input_schema 比 prompt 更省 token，因为没有重复结构指令）。",
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
          "content[type=tool_use].input": "协议 B 把 input 按 input_schema 解析为对象（无须 JSON.parse）",
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

  // ② 强制 tool_use 时，input 已经按 input_schema 解析好。模型偶尔会先说一段 text，忽略即可。
  let inputObj: unknown = null;
  let usedToolBlock: ToolUseMeta | null = null;
  for (const block of res.content) {
    if (block.type === "tool_use") {
      usedToolBlock = { id: block.id, name: block.name };
      inputObj = block.input;
    }
  }

  const rawJson = JSON.stringify(inputObj, null, 2);
  console.log(
    `  /api/tool-use tool_use: ${usedToolBlock?.name ?? "(无)"} · input: ${rawJson.slice(0, 300)}${rawJson.length > 300 ? "..." : ""}`,
  );

  // ③ 仍然 Zod：input_schema 是倾向，不是硬闸。prompt 强引导可能写出 enum 外的值。
  const parsedResult = safeParseIntentObject(inputObj);

  const result: ModeCallResult = {
    mode: "tool_use_forced",
    raw: rawJson,
    parseOk: parsedResult.ok,
    parsed: parsedResult.ok ? parsedResult.data : null,
    parseError: parsedResult.ok ? null : parsedResult.error,
    analysis: analyzeObject(inputObj, parsedResult, prompt),
    toolUse: usedToolBlock,
    elapsedMs: Math.round(performance.now() - t0),
  };
  logger.info(
    "│ 强制 tool_choice-runToolUseForced",
    "调用函数结束：runToolUseForced",
    "为什么写这条日志：route 要把 ModeCallResult 写进 ctx.body 交给页面 stats 区；打 toolUse / parseOk 便于对照「text 路径 vs tool-use 路径」的差异。",
    {
      返回值: {
        mode: result.mode,
        parseOk: result.parseOk,
        toolUse: result.toolUse,
        elapsedMs: result.elapsedMs,
      },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  return result;
}