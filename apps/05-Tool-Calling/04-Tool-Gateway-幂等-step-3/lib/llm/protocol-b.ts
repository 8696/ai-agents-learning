/**
 * 职责：协议 B 封装 —— Anthropic Messages API（含 tools + tool_choice）。
 * 数据流：messages + tools → llm.anthropic.messages.create() → response。
 *
 * 协议 B 关键差异（vs 协议 A · OpenAI Chat Completions）：
 *   - API 路径：`messages.create`（不是 `chat.completions.create`）
 *   - 必填字段：`max_tokens` 不填直接 400（Anthropic Messages API 硬约束）
 *   - tools 形状：`{ name, description, input_schema }`（无 `function` 包裹、无 `parameters`）
 *   - tool_use 决定调：`content: [{ type: "tool_use", id, name, input }]`
 *     - `input` 是**对象**（vs 协议 A 的 `tool_calls[i].function.arguments` = JSON 字符串）
 *   - 回灌 tool_result：role:"user" + content:`[{type:"tool_result", tool_use_id, content}]` blocks
 *   - 响应 content：数组结构（blocks），不是协议 A 的 `message.content: string | null`
 *   - 终止原因：stop_reason（end_turn / max_tokens / tool_use）vs 协议 A 的 finish_reason
 *
 * 日志（）：路由层 (routes/chat.ts) 负责 chat.* 与 llm.* 的大节点；
 *   本文件只补充 trace层 = request shape / response id+usage / error status。
 */
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

// ── Anthropic tools 数组里单项的形状 ──
export type AnthropicToolSchema = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required: string[];
  };
};

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

/** 真调一次协议 B。返回完整 response 让前端展示。 */
export async function callProtocolB(request: ProtocolBRequest): Promise<ProtocolBResponse> {
  const llm = getLlm();
  logger.debug("protocol-b.call", "→ anthropic.messages.create", "调 Anthropic 协议 B 发起请求", {
    model: request.model,
    max_tokens: request.max_tokens,
    messagesCount: request.messages.length,
    toolsCount: request.tools?.length ?? 0,
    __code: `await llm.anthropic.messages.create(${JSON.stringify(request, null, 2)});`,
  });
  const response = (await llm.anthropic.messages.create(request as never)) as unknown as ProtocolBResponse;
  logger.debug("protocol-b.done", "← got response", "协议 B 返回", response);
  return response;
}