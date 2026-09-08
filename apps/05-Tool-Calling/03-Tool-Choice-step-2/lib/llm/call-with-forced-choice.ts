/**
 * 职责：协议 A 单次补全 —— 支持 required 或指定函数 object 形态。
 * 数据流：messages + tools + tool_choice → OpenAI SDK → ChoiceRunResult。
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
  const { llm, query, choiceKind, forcedName } = args;
  const scope = "│ 调用函数-callWithForcedChoice";
  const t0 = Date.now();
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
    scope,
    "调用函数开始：callWithForcedChoice",
    "为什么打：本步对照 required（任选）vs 指定 name（钉死）。里面那次才是出网。当前：组装请求。",
    {
      入参: { query, choiceKind, forcedName, model: llm.modelA },
      __code:
        'tool_choice: kind==="required" ? "required" : { type:"function", function:{ name } }',
    },
  );

  const modelScope = "││ 调用模型-对话补全";
  logger.info(
    modelScope,
    "调用模型开始：对话补全",
    "为什么打：真正出网；看响应里 tool name 是否等于 forcedName。当前：即将 create。",
    { 入参: request, __code: "const resp = await llm.openai.chat.completions.create(request);" },
  );

  let resp;
  try {
    resp = await llm.openai.chat.completions.create(request);
  } catch (error: unknown) {
    logger.error(
      modelScope,
      "调用模型结束：对话补全（失败）",
      "为什么打：出网失败也要闭环。当前：create 抛错（含 thinking×object 边界）。",
      { 返回值: error, 耗时ms: Date.now() - t0 },
    );
    logger.error(
      scope,
      "调用函数结束：callWithForcedChoice（失败）",
      "为什么打：外层封装失败收口。",
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
    modelScope,
    "调用模型结束：对话补全",
    "为什么打：出网结束。当前：已抽出 firstToolName 供钉死对照。",
    {
      返回值: resp,
      字段释义: {
        finish_reason: "结束原因",
        "message.tool_calls[].function.name": "实际调了哪个；force 档应恒等于 forcedName",
        tool_choice: "请求里写死的形态（required 字符串或 function object）",
      },
      耗时ms: result.elapsedMs,
    },
  );

  logger.info(
    scope,
    "调用函数结束：callWithForcedChoice",
    "为什么打：封装收口交给 route。",
    { 返回值: result, 耗时ms: result.elapsedMs },
  );

  return result;
}
