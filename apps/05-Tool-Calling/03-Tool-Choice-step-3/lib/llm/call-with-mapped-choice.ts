/**
 * 职责：协议 A 单次补全；tool_choice 由产品开关映射而来。
 */
import type {
  ChatCompletionMessageParam,
  ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions";
import type { Llm } from "../../../../llm.js";
import { logger } from "../logger.js";
import { TOOLS } from "../tools/registry.js";

export type SwitchRunResult = {
  toolChoiceSent: ChatCompletionToolChoiceOption;
  model: string;
  finishReason: string | null;
  content: string | null;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  hasToolCalls: boolean;
  usage: unknown;
  elapsedMs: number;
};

export async function callWithMappedChoice(args: {
  llm: Llm;
  query: string;
  toolChoice: ChatCompletionToolChoiceOption;
  switchId: string;
}): Promise<SwitchRunResult> {
  const { llm, query, toolChoice, switchId } = args;
  const scope = "│ 调用函数-callWithMappedChoice";
  const t0 = Date.now();

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: "你是客服助手。需要查物流时调用工具；否则用中文直接答。",
    },
    { role: "user", content: query },
  ];
  const request = {
    model: llm.modelA,
    messages,
    tools: TOOLS,
    tool_choice: toolChoice,
  };

  logger.info(
    scope,
    "调用函数开始：callWithMappedChoice",
    "为什么打：用户点了产品开关，后端已映射成 tool_choice；里面才出网。当前：组装。",
    {
      入参: { switchId, query, toolChoice, model: llm.modelA },
      __code: "await llm.openai.chat.completions.create({ tools, tool_choice })",
    },
  );

  const modelScope = "││ 调用模型-对话补全";
  logger.info(
    modelScope,
    "调用模型开始：对话补全",
    "为什么打：真正出网；对照开关映射是否在请求字段里生效。当前：create。",
    { 入参: request, __code: "const resp = await llm.openai.chat.completions.create(request);" },
  );

  let resp;
  try {
    resp = await llm.openai.chat.completions.create(request);
  } catch (error: unknown) {
    logger.error(
      modelScope,
      "调用模型结束：对话补全（失败）",
      "为什么打：出网失败闭环（含 thinking×required）。",
      { 返回值: error, 耗时ms: Date.now() - t0 },
    );
    logger.error(
      scope,
      "调用函数结束：callWithMappedChoice（失败）",
      "为什么打：外层收口。",
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
  const result: SwitchRunResult = {
    toolChoiceSent: toolChoice,
    model: llm.modelA,
    finishReason: resp.choices[0]?.finish_reason ?? null,
    content: msg?.content ?? null,
    toolCalls,
    hasToolCalls: toolCalls.length > 0,
    usage: resp.usage ?? null,
    elapsedMs: Date.now() - t0,
  };

  logger.info(
    modelScope,
    "调用模型结束：对话补全",
    "为什么打：出网结束。",
    {
      返回值: resp,
      字段释义: {
        tool_choice: "由产品开关映射，不是模型自己改的",
        hasToolCalls: "对照开关：只聊天应无；强制查库应有；允许工具看语义",
      },
      耗时ms: result.elapsedMs,
    },
  );
  logger.info(
    scope,
    "调用函数结束：callWithMappedChoice",
    "为什么打：交给 route。",
    { 返回值: result, 耗时ms: result.elapsedMs },
  );
  return result;
}
