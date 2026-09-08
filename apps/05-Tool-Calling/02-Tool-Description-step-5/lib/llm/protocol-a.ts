/**
 * 职责：协议 A 封装 —— OpenAI Chat Completions（含 tools + tool_choice）。本 Demo 单轮调用即可。
 * 数据流：messages + tools → openai.chat.completions.create() → response。
 * 为什么单独成文件：业务层 (routes/compare.ts) 只面对这一个函数；切协议 B 时换 ./protocol-b.ts 即可。
 *
 * 与 step-1（01）的区别：01 那条做了完整两轮（tool_calls → tool_result → final_reply）；
 *   本条只调一次，拿到 tool_calls 即可 —— 教学点是「description 写得好不好 → 模型选哪个 Tool」，
 *   不在「执行 tool_result」。所以省掉 round-2。
 *
 * 日志（§5.3.16）：路由层 (routes/compare.ts) 负责 compare.* 与 llm.* 的大节点；
 *   本文件只补充 trace 级 —— request shape / response id+usage / error status。
 */
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

// ── OpenAI Chat Completions tools 数组里单项的形状 ──
export type ToolSchema = {
  type: "function";
  function: {
    name: string;            // 工具名（给模型看 + 路由 key）
    description: string;     // 工具描述（给模型看：何时该调）；写不好 = 模型不会调 / 乱调 ← 本条核心
    parameters: {
      type: "object";
      // 字段级 description 是给模型看的提示（不是给程序看）。本 Demo 让 lib/tools/compare-sets.ts 直接传 { type, description, enum? } 进 properties。
      properties: Record<string, { type: string; description?: string; enum?: string[] }>;
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
  const llm = getLlm(); // 没 Key 直接抛——业务层 catch 兜底
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
