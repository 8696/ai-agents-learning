/**
 * 职责：协议 A 单次补全；tool_choice 由产品开关映射而来。
 * 数据流：messages + tools + tool_choice → OpenAI SDK → SwitchRunResult。
 *
 * 日志（§5.3.16）：调用函数 五件套（callWithMappedChoice 封装层），调用模型 五件套（出网层，含 __code + 字段释义）。
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
  const tFuncStart = Date.now();
  const t0 = Date.now();
  const { llm, query, toolChoice, switchId } = args;

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
    "│ 开关映射-callWithMappedChoice",
    "调用函数开始：callWithMappedChoice",
    "为什么打：route 只认这一层返回的 SwitchRunResult；里面那次才是出网（看「调用模型开始：协议A-对话补全」）。当前：用户点了产品开关，后端已映射成 tool_choice；组装。",
    {
      入参: { switchId, query, toolChoice, model: llm.modelA },
      __code: "await llm.openai.chat.completions.create({ tools, tool_choice })",
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    "为什么打：本文件唯一的真出网层；不打就没有 finishReason / tool_calls / usage。当前：真正出网；对照开关映射是否在请求字段里生效。",
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
      "为什么打：拿到 upstreamStatus 才能区分 401/403（Key）、429（限流）、5xx、400（thinking×required）。当前：create 抛错。",
      {
        返回值: { message: error instanceof Error ? error.message : String(error) },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    logger.error(
      "│ 开关映射-callWithMappedChoice",
      "调用函数结束：callWithMappedChoice（失败）",
      "为什么打：外层收口；记 err 便于 route 的 catch 区分 400/502。",
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
    "││ 调用模型-协议A 对话补全",
    "调用模型结束：协议A 对话补全",
    "为什么打：要拿 choices[0].finish_reason + tool_calls 决定下一步；usage 是计费依据。",
    {
      返回值: {
        finishReason: result.finishReason,
        toolCallCount: result.toolCalls.length,
        usage: result.usage,
      },
      耗时ms: Date.now() - tModelStart,
      字段释义: {
        tool_choice: "由产品开关映射，不是模型自己改的",
        hasToolCalls: "对照开关：只聊天应无；强制查库应有；允许工具看语义",
      },
    },
  );
  logger.info(
    "│ 开关映射-callWithMappedChoice",
    "调用函数结束：callWithMappedChoice",
    "为什么打：交给 route；记 hasToolCalls + toolChoiceSent 便于 route 协议判定。",
    {
      返回值: { toolChoiceSent: result.toolChoiceSent, hasToolCalls: result.hasToolCalls, elapsedMs: result.elapsedMs },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  return result;
}