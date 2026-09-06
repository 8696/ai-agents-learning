/**
 * 职责：协议 A 封装 —— OpenAI Chat Completions（含 tools + tool_choice）。
 * 数据流：messages + tools → openai.chat.completions.create() → response。
 *
 * step-8 vs step-2：同一个协议 A 封装；step-8 在路由层加 detectHallucination，
 *   把 reply 数字 vs tool_result 数字的差异自动列出来（MD 「编造检测」可观察演示）。
 *
 * 教学锚点（本文件的核心价值）：
 *   下面每个类型的字段都标了"是什么 / 为什么"——把这些字段在协议层的物理意义讲透。
 *   前端在 /api/chat 返回值里拿到完整 request/response + tool_results + 编造检测，
 *   **让学习者"看见"协议层到底发了什么、模型回了什么、模型有没有"编造"数字**。
 *
 * 日志（§5.3.16）：路由层 (routes/chat.ts) 负责 chat.* 与 llm.* 的大节点；
 *   本文件只补充 trace 级 —— request shape / response id+usage / error status。
 */
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

// ── OpenAI Chat Completions tools 数组里单项的形状 ──
//   每一项 = 一份「工具契约」告诉模型：你可以调这个，参数长这样。
export type ToolSchema = {
  type: "function";
  function: {
    name: string;            // 工具名（给模型看 + 路由 key）
    description: string;     // 工具描述（给模型看：何时该调）；写不好 = 模型不会调 / 乱调
    parameters: {            // JSON Schema：参数应该长啥样
      type: "object";
      properties: Record<string, { type: string; description?: string }>;
      required: string[];    // 必填字段；模型会优先填齐
    };
  };
};

// ── OpenAI 风格 messages 数组里单项的形状（覆盖所有 role）──
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
  function: {
    name: string;
    arguments: string;                     // **是 JSON 字符串，不是对象**
  };
};

// ── 请求体（OpenAI Chat Completions API）──
export type ProtocolARequest = {
  model: string;
  messages: ChatMsg[];
  tools?: ToolSchema[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  temperature?: number;
};

// ── 响应体（OpenAI Chat Completions API）──
export type ProtocolAResponse = {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: ChatMsgToolCall[];
    };
    finish_reason: "stop" | "tool_calls" | "length" | "content_filter";
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

/** 真调一次协议 A。返回完整 response 让前端可视化。 */
export async function callProtocolA(request: ProtocolARequest): Promise<ProtocolAResponse> {
  const llm = getLlm();
  logger.debug("protocol-a.call", "→ openai.chat.completions.create", "调 OpenAI 协议 A 发起请求；完整打 request 便于核对 model / messages / tools 字段是否齐", {
    model: request.model,
    messagesCount: request.messages.length,
    toolsCount: request.tools?.length ?? 0,
    tool_choice: request.tool_choice,
    __code: `await llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
  });
  const response = (await llm.openai.chat.completions.create(request as never)) as unknown as ProtocolAResponse;
  logger.debug("protocol-a.done", "← got response", "协议 A 返回；完整打响应便于追 SDK 自带字段（id / choices / usage）", response);
  return response;
}
