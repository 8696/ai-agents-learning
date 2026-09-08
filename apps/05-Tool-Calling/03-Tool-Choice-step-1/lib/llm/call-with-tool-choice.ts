/**
 * 职责：协议 A 单次补全封装（真正出网在本函数内部的 chat.completions.create）。
 * 数据流：messages + tools + tool_choice → OpenAI SDK → 规范化后的 ChoiceRunResult。
 *
 * 日志（§5.3.16）：调用函数 五件套（callWithToolChoice 封装层），调用模型 五件套（出网层，含 __code + 字段释义）。
 */
import type { ChatCompletionMessageParam, ChatCompletionToolChoiceOption } from "openai/resources/chat/completions";
import type { Llm } from "../../../../llm.js";
import { logger } from "../logger.js";
import { TOOLS } from "../tools/registry.js";

export type ToolChoiceMode = "auto" | "none" | "required";

export type ChoiceRunResult = {
  toolChoiceSent: ToolChoiceMode;
  model: string;
  finishReason: string | null;
  content: string | null;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  hasToolCalls: boolean;
  usage: unknown;
  rawMessage: unknown;
  elapsedMs: number;
};

function toApiToolChoice(mode: ToolChoiceMode): ChatCompletionToolChoiceOption {
  return mode;
}

export async function callWithToolChoice(args: {
  llm: Llm;
  query: string;
  toolChoice: ToolChoiceMode;
}): Promise<ChoiceRunResult> {
  const { llm, query, toolChoice } = args;
  const tFuncStart = Date.now();
  const t0 = Date.now();

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: "你是客服助手。需要查物流时调用工具；不需要时直接用中文回答。",
    },
    { role: "user", content: query },
  ];
  const apiToolChoice = toApiToolChoice(toolChoice);
  const request = {
    model: llm.modelA,
    messages,
    tools: TOOLS,
    tool_choice: apiToolChoice,
  };

  logger.info(
    "│ 工具选择-callWithToolChoice",
    "调用函数开始：callWithToolChoice",
    "为什么打：route 只认这一层返回的 ChoiceRunResult；里面那次才是出网（看「调用模型开始：协议A-对话补全」）。当前：页面选了一档 tool_choice，这里封装一次协议 A 调用；组装 messages/tools/tool_choice。",
    {
      入参: { query, toolChoice, model: llm.modelA, toolNames: TOOLS.map((t) => (t.type === "function" ? t.function.name : "?")) },
      __code: "await llm.openai.chat.completions.create({ model, messages, tools, tool_choice })",
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    "为什么打：本文件唯一的真出网层；不打就没有 finishReason / tool_calls / usage。当前：这是真正出网的那一次；本条教学点是看 tool_choice 如何改变是否出现 tool_calls。",
    {
      入参: { model: request.model, messagesCount: request.messages.length, toolsCount: request.tools?.length ?? 0, tool_choice: request.tool_choice },
      __code: "const resp = await llm.openai.chat.completions.create(request);",
    },
  );

  let resp;
  try {
    resp = await llm.openai.chat.completions.create(request);
  } catch (error: unknown) {
    logger.error(
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全（失败）",
      "为什么打：拿到 upstreamStatus 才能区分 401/403（Key）、429（限流）、5xx；未识别 → 500。当前：create 抛错，route 的 catch 会处理。",
      {
        返回值: { message: error instanceof Error ? error.message : String(error) },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    logger.error(
      "│ 工具选择-callWithToolChoice",
      "调用函数结束：callWithToolChoice（失败）",
      "为什么打：外层封装失败收口；记 err 便于 route 的 catch 区分 400/502。",
      {
        返回值: { ok: false, error: error instanceof Error ? error.message : String(error) },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    throw error;
  }

  const msg = resp.choices[0]?.message;
  const toolCalls = (msg?.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.type === "function" ? tc.function.name : "(non-function)",
    arguments: tc.type === "function" ? tc.function.arguments : "",
  }));
  const result: ChoiceRunResult = {
    toolChoiceSent: toolChoice,
    model: llm.modelA,
    finishReason: resp.choices[0]?.finish_reason ?? null,
    content: msg?.content ?? null,
    toolCalls,
    hasToolCalls: toolCalls.length > 0,
    usage: resp.usage ?? null,
    rawMessage: msg ?? null,
    elapsedMs: Date.now() - t0,
  };

  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型结束：协议A 对话补全",
    "为什么打：要拿 choices[0].finish_reason + tool_calls 决定下一步；usage 是计费依据。本条教学点——记 hasToolCalls 给 route 区分 required / none。",
    {
      返回值: {
        finishReason: result.finishReason,
        toolCallCount: result.toolCalls.length,
        usage: result.usage,
      },
      耗时ms: Date.now() - tModelStart,
      字段释义: {
        finish_reason: "本轮结束原因；有 tool_calls 时常为 tool_calls",
        "message.tool_calls": "模型请求调用的工具列表；none 档期望为空",
        "message.content": "自然语言回复；可与 tool_calls 同轮并存（auto）",
        tool_choice: "请求里写死的档位，模型不能自己改",
      },
    },
  );
  logger.info(
    "│ 工具选择-callWithToolChoice",
    "调用函数结束：callWithToolChoice",
    "为什么打：封装收口，把教学字段交给 route。当前：已规范化 tool_calls。",
    {
      返回值: { toolChoiceSent: result.toolChoiceSent, hasToolCalls: result.hasToolCalls, elapsedMs: result.elapsedMs },
      耗时ms: Date.now() - tFuncStart,
    },
  );

  return result;
}