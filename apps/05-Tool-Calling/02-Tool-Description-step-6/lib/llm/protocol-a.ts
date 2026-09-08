/**
 * 职责：协议 A 封装 —— OpenAI Chat Completions（含 tools + tool_choice）。本 Demo 单轮调用即可。
 * 数据流：messages + tools → openai.chat.completions.create() → response。
 *
 * 日志（§5.3.16）：调用函数 五件套（callProtocolA 封装层），调用模型 五件套（出网层，含 __code + 字段释义）。
 */
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

export type ToolSchema = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description?: string }>;
      required: string[];
    };
  };
};

export type ChatMsg =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ChatMsgToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export type ChatMsgToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ProtocolARequest = {
  model: string;
  messages: ChatMsg[];
  tools?: ToolSchema[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  temperature?: number;
};

export type ProtocolAResponse = {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: { role: "assistant"; content: string | null; tool_calls?: ChatMsgToolCall[] };
    finish_reason: "stop" | "tool_calls" | "length" | "content_filter";
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

/** 真调一次协议 A。返回完整 response 让前端可视化。 */
export async function callProtocolA(request: ProtocolARequest): Promise<ProtocolAResponse> {
  const tFuncStart = Date.now();
  const llm = getLlm();
  logger.info(
    "│ 协议A-callProtocolA",
    "调用函数开始：callProtocolA",
    "为什么打：route 只认这一层返回的 ProtocolAResponse；里面那次才是出网（看「调用模型开始：协议A-对话补全」）。当前：调 OpenAI 协议 A 发起请求；完整打 request 便于核对 model / messages / tools 字段是否齐。",
    {
      入参: { model: request.model, messagesCount: request.messages.length, toolsCount: request.tools?.length ?? 0, tool_choice: request.tool_choice },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    "为什么打：本文件唯一的真出网层；不打就没有 id / choices / usage / finish_reason。当前：即将发出 chat.completions.create 请求。",
    {
      入参: {
        model: request.model,
        messagesCount: request.messages.length,
        toolsCount: request.tools?.length ?? 0,
        tool_choice: request.tool_choice,
      },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
    },
  );

  try {
    const response = (await llm.openai.chat.completions.create(request as never)) as unknown as ProtocolAResponse;
    logger.info(
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全",
      "为什么打：要拿 choices[0].finish_reason 决定下一步动作；usage 是计费依据。本 Demo 单轮——只关心 finish_reason=tool_calls 时第一个 tool_call 的 name 用于对照。",
      {
        返回值: {
          id: response.id,
          model: response.model,
          finishReason: response.choices?.[0]?.finish_reason,
          toolCallCount: response.choices?.[0]?.message?.tool_calls?.length ?? 0,
          usage: response.usage,
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          "choices[0].finish_reason": "stop=正常 / tool_calls=模型要调工具 / length=截断 / content_filter=内容被拦",
          usage: "OpenAI 标准 usage 三字段（计费依据）",
        },
      },
    );
    logger.info(
      "│ 协议A-callProtocolA",
      "调用函数结束：callProtocolA",
      "为什么打：route 要把 ProtocolAResponse 写进 ctx.body 交给页面 stats 区。",
      {
        返回值: { id: response.id, model: response.model, finishReason: response.choices?.[0]?.finish_reason },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return response;
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
    throw error;
  }
}