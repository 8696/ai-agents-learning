/**
 * 职责：协议 A 单次补全 —— 支持 required 或指定函数 object 形态。
 * 数据流：messages + tools + tool_choice → OpenAI SDK → ChoiceRunResult。
 *
 * 日志（§5.3.16）：调用函数 五件套（callWithForcedChoice 封装层），调用模型 五件套（出网层，含 __code + 字段释义）。
 */
import type {
  ChatCompletionMessageParam,
  ChatCompletionToolChoiceOption,
} from "openai/resources/chat/completions";
import type { Llm } from "../../../../llm.js";
import { logger } from "../logger.js";
import { TOOLS, type ForceableName } from "../tools/registry.js";

export type ChoiceKind = "required" | "force";

export type ChoiceRunResult = {
  choiceKind: ChoiceKind;
  forcedName: ForceableName | null;
  toolChoiceSent: ChatCompletionToolChoiceOption;
  model: string;
  finishReason: string | null;
  content: string | null;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  hasToolCalls: boolean;
  firstToolName: string | null;
  usage: unknown;
  elapsedMs: number;
};

function toApiToolChoice(
  kind: ChoiceKind,
  forcedName: ForceableName | null,
): ChatCompletionToolChoiceOption {
  if (kind === "required") return "required";
  if (!forcedName) throw new Error("force 形态必须带 forcedName");
  return { type: "function", function: { name: forcedName } };
}

export async function callWithForcedChoice(args: {
  llm: Llm;
  query: string;
  choiceKind: ChoiceKind;
  forcedName: ForceableName | null;
}): Promise<ChoiceRunResult> {
  const tFuncStart = Date.now();
  const t0 = Date.now();
  const { llm, query, choiceKind, forcedName } = args;
  const apiToolChoice = toApiToolChoice(choiceKind, forcedName);

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "你是客服助手。查快递用 query_logistics；查天气用 get_weather。按工具能力回答。",
    },
    { role: "user", content: query },
  ];

  const request = {
    model: llm.modelA,
    messages,
    tools: TOOLS,
    tool_choice: apiToolChoice,
  };

  logger.info(
    "│ 强制选择-callWithForcedChoice",
    "调用函数开始：callWithForcedChoice",
    "为什么打：route 只认这一层返回的 ChoiceRunResult；里面那次才是出网（看「调用模型开始：协议A-对话补全」）。当前：本步对照 required（任选）vs 指定 name（钉死）；组装请求。",
    {
      入参: { query, choiceKind, forcedName, model: llm.modelA },
      __code: 'tool_choice: kind==="required" ? "required" : { type:"function", function:{ name } }',
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    "为什么打：本文件唯一的真出网层；不打就没有 finishReason / tool_calls / usage。当前：真正出网；看响应里 tool name 是否等于 forcedName（force 档）。",
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
      "为什么打：拿到 upstreamStatus 才能区分 401/403（Key）、429（限流）、5xx、400（thinking×object 边界）。当前：create 抛错。",
      {
        返回值: { message: error instanceof Error ? error.message : String(error) },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    logger.error(
      "│ 强制选择-callWithForcedChoice",
      "调用函数结束：callWithForcedChoice（失败）",
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
  const firstToolName = toolCalls[0]?.name ?? null;
  const result: ChoiceRunResult = {
    choiceKind,
    forcedName,
    toolChoiceSent: apiToolChoice,
    model: llm.modelA,
    finishReason: resp.choices[0]?.finish_reason ?? null,
    content: msg?.content ?? null,
    toolCalls,
    hasToolCalls: toolCalls.length > 0,
    firstToolName,
    usage: resp.usage ?? null,
    elapsedMs: Date.now() - t0,
  };

  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型结束：协议A 对话补全",
    "为什么打：要拿 choices[0].finish_reason + tool_calls 决定下一步；usage 是计费依据。本条教学点——记 firstToolName 供钉死对照（force 档应恒等于 forcedName）。",
    {
      返回值: {
        finishReason: result.finishReason,
        firstToolName: result.firstToolName,
        toolCallCount: result.toolCalls.length,
        usage: result.usage,
      },
      耗时ms: Date.now() - tModelStart,
      字段释义: {
        finish_reason: "结束原因",
        "message.tool_calls[].function.name": "实际调了哪个；force 档应恒等于 forcedName",
        tool_choice: "请求里写死的形态（required 字符串或 function object）",
      },
    },
  );
  logger.info(
    "│ 强制选择-callWithForcedChoice",
    "调用函数结束：callWithForcedChoice",
    "为什么打：封装收口交给 route。",
    {
      返回值: { choiceKind, hasToolCalls: result.hasToolCalls, firstToolName: result.firstToolName, elapsedMs: result.elapsedMs },
      耗时ms: Date.now() - tFuncStart,
    },
  );

  return result;
}