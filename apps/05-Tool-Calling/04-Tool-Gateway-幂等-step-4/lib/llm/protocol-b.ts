/**
 * 职责：协议 B 封装 —— Anthropic Messages API（含 tools + tool_choice）。
 * 数据流：messages + tools → llm.anthropic.messages.create() → response。
 */
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

export type AnthropicToolSchema = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description?: string }>;
    required: string[];
  };
};

export type AnthropicChatMsg =
  | { role: "user"; content: string }
  | { role: "assistant"; content: AnthropicContentBlock[] }
  | { role: "user"; content: AnthropicContentBlock[] };

export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string | AnthropicContentBlock[]; is_error?: boolean };

export type ProtocolBRequest = {
  model: string;
  messages: AnthropicChatMsg[];
  system?: string;
  tools?: AnthropicToolSchema[];
  tool_choice?: { type: "auto" | "any" | "tool"; name?: string };
  max_tokens: number;
  temperature?: number;
};

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