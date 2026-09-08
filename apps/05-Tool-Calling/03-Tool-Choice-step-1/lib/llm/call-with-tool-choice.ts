/**
 * 职责：协议 A 单次补全封装（真正出网在本函数内部的 chat.completions.create）。
 * 数据流：messages + tools + tool_choice → OpenAI SDK → 规范化后的 ChoiceRunResult。
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
  const scope = "│ 调用函数-callWithToolChoice";
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
    scope,
    "调用函数开始：callWithToolChoice",
    "为什么打：页面选了一档 tool_choice，这里封装一次协议 A 调用；里面那次才是出网。当前：组装 messages/tools/tool_choice。",
    {
      入参: { query, toolChoice, model: llm.modelA, toolNames: TOOLS.map((t) => (t.type === "function" ? t.function.name : "?")) },
      __code: "await llm.openai.chat.completions.create({ model, messages, tools, tool_choice })",
    },
  );

  const modelScope = "││ 调用模型-对话补全";
  logger.info(
    modelScope,
    "调用模型开始：对话补全",
    "为什么打：这是真正出网的那一次；本条教学点是看 tool_choice 如何改变是否出现 tool_calls。当前：即将 create。",
    { 入参: request, __code: "const resp = await llm.openai.chat.completions.create(request);" },
  );

  let resp;
  try {
    resp = await llm.openai.chat.completions.create(request);
  } catch (error: unknown) {
    logger.error(
      modelScope,
      "调用模型结束：对话补全（失败）",
      "为什么打：出网失败也要闭环五件套。当前：create 抛错。",
      { 返回值: error, 耗时ms: Date.now() - t0 },
    );
    logger.error(
      scope,
      "调用函数结束：callWithToolChoice（失败）",
      "为什么打：外层封装失败收口。当前：向上抛给 route。",
      { 返回值: error, 耗时ms: Date.now() - t0 },
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
    modelScope,
    "调用模型结束：对话补全",
    "为什么打：出网结束，带回完整响应供页面三档对照。当前：已规范化 tool_calls。",
    {
      返回值: resp,
      字段释义: {
        finish_reason: "本轮结束原因；有 tool_calls 时常为 tool_calls",
        "message.tool_calls": "模型请求调用的工具列表；none 档期望为空",
        "message.content": "自然语言回复；可与 tool_calls 同轮并存（auto）",
        tool_choice: "请求里写死的档位，模型不能自己改",
      },
      耗时ms: result.elapsedMs,
    },
  );

  logger.info(
    scope,
    "调用函数结束：callWithToolChoice",
    "为什么打：封装收口，把教学字段交给 route。当前：准备 ctx.body。",
    { 返回值: result, 耗时ms: result.elapsedMs },
  );

  return result;
}
