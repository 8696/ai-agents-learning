/**
 * 职责：协议 B 封装 —— Anthropic Messages API（含 tools + tool_choice）。
 * 数据流：messages + tools → llm.anthropic.messages.create() → response。
 *
 * step-6 关键差异（vs step-1~5 协议 A）：
 *   - **API 路径**：`messages.create` 而不是 `chat.completions.create`
 *   - **必填字段**：`max_tokens` 不填直接 400（对齐 Anthropic Messages API 硬约束）
 *   - **tools 形状**：`{ name, description, input_schema }`（无 `function` 包裹、无 `parameters`）
 *   - **tool_use 决定调**：`content: [{ type: "tool_use", id, name, input }]`（input 是对象，不是 JSON 字符串）
 *   - **回灌 tool_result**：用 `role: "user"`, `content: [{ type: "tool_result", tool_use_id, content }]`（不是 `role: "tool"`）
 *   - **响应 content**：数组结构（blocks），不是协议 A 的 `message.content: string | null`
 *
 * 日志（§5.3.16）：调用函数 五条日志（callProtocolB 封装层），调用模型 五条日志（真正发网络请求的那一层，含 __code + 字段释义）。
 */
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

// ── Anthropic tools 数组里单项的形状 ──
export type AnthropicToolSchema = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required: string[];
  };
};

// ── OpenAI 工具格式 → Anthropic 工具格式 翻译 ──
export function openAIToAnthropicSchema(openAITools: Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description?: string; enum?: string[] }>;
      required: string[];
    };
  };
}>): AnthropicToolSchema[] {
  return openAITools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: {
      type: t.function.parameters.type,
      properties: t.function.parameters.properties,
      required: t.function.parameters.required,
    },
  }));
}

// ── Anthropic 风格 messages 数组里单项的形状（覆盖所有 role + content blocks）──
export type AnthropicChatMsg =
  | { role: "user"; content: string }
  | { role: "assistant"; content: AnthropicContentBlock[] }
  | { role: "user"; content: AnthropicContentBlock[] };

export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string | AnthropicContentBlock[]; is_error?: boolean };

// ── 请求体（Anthropic Messages API）──
export type ProtocolBRequest = {
  model: string;
  messages: AnthropicChatMsg[];
  system?: string;
  tools?: AnthropicToolSchema[];
  tool_choice?: { type: "auto" | "any" | "tool"; name?: string };
  max_tokens: number;
  temperature?: number;
};

// ── 响应体（Anthropic Messages API）──
export type ProtocolBResponse = {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: AnthropicContentBlock[];
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use";
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
};

/** 真调一次协议 B。返回完整 response 让前端可视化。 */
export async function callProtocolB(request: ProtocolBRequest): Promise<ProtocolBResponse> {
  const tFuncStart = Date.now();
  const llm = getLlm();
  logger.info(
    "│ 协议B-callProtocolB",
    "调用函数开始：callProtocolB",
    "为什么写这条日志：route 只认这一层返回的 ProtocolBResponse；里面那次才是真发网络请求（看「调用模型开始：协议B-消息创建」）。当前：调 Anthropic 协议 B 发起请求；完整写 request 便于核对 model / messages / tools / max_tokens。",
    {
      入参: { model: request.model, max_tokens: request.max_tokens, messagesCount: request.messages.length, toolsCount: request.tools?.length ?? 0 },
      __code: `await llm.anthropic.messages.create(${JSON.stringify(request, null, 2)});`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议B 消息创建",
    "调用模型开始：协议B 消息创建",
    "为什么写这条日志：本文件唯一真正发网络请求的那一层；不写就没有 id / content blocks / stop_reason / usage。当前：即将发出 messages.create 请求；max_tokens 是必填字段。",
    {
      入参: {
        model: request.model,
        max_tokens: request.max_tokens,
        messagesCount: request.messages.length,
        toolsCount: request.tools?.length ?? 0,
      },
      __code: `await llm.anthropic.messages.create(${JSON.stringify(request, null, 2)});`,
    },
  );

  try {
    const response = (await llm.anthropic.messages.create(request as never)) as unknown as ProtocolBResponse;
    logger.info(
      "││ 调用模型-协议B 消息创建",
      "调用模型结束：协议B 消息创建",
      "为什么写这条日志：要拿 stop_reason 决定下一步动作（end_turn / max_tokens / tool_use）；usage 是计费依据。当前：await 已返回。",
      {
        返回值: {
          id: response.id,
          model: response.model,
          stopReason: response.stop_reason,
          contentBlockCount: response.content?.length ?? 0,
          toolUseCount: (response.content ?? []).filter((b) => b.type === "tool_use").length,
          usage: response.usage,
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          stop_reason: "end_turn=自然结束 / max_tokens=撞 max_tokens / tool_use=模型要调工具",
          "usage.input_tokens": "输入侧 Token 数（计费依据）",
          "usage.output_tokens": "输出侧 Token 数（计费依据）",
        },
      },
    );
    logger.info(
      "│ 协议B-callProtocolB",
      "调用函数结束：callProtocolB",
      "为什么写这条日志：route 要把 ProtocolBResponse 写进 ctx.body 交给页面 stats 区；记 id / stopReason 便于核对。",
      {
        返回值: { id: response.id, model: response.model, stopReason: response.stop_reason },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return response;
  } catch (error: unknown) {
    logger.error(
      "││ 调用模型-协议B 消息创建",
      "调用模型结束：协议B 消息创建（失败）",
      "为什么写这条日志：拿到 status 才能区分 401/403（Key）、429（限流）、5xx、400（max_tokens 漏填）。当前：create 抛错。",
      {
        返回值: { message: error instanceof Error ? error.message : String(error) },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    throw error;
  }
}