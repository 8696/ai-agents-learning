/**
 * 职责：协议 A 封装 —— OpenAI Chat Completions（含 tools + tool_choice）。
 * 数据流：messages + tools → openai.chat.completions.create() → response。
 * 为什么单独成文件：业务层 (routes/chat.ts) 只面对这一个函数；切协议 B 时换 ./protocol-b.ts 即可。
 *
 * 教学锚点（本文件的核心价值）：
 *   下面每个类型的字段都标了"是什么 / 为什么"——把这些字段在协议层的物理意义讲透。
 *   前端在 /api/chat 返回值里拿到完整 request/response，**让学习者"看见"协议层到底发了什么、模型回了什么**。
 *
 * 与 step-1 mock 的对比：
 *   step-1 的 decideToolCalls() 是 hardcode 决定；
 *   step-2 这里换成真模型调 LLM —— 拿到的是不确定的、模型自己决定的 tool_calls。
 *   这就是"模型决定 ≠ 已执行"在协议层的真实物理形态。
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
//   这一轮的对话历史；step-2 里两轮各塞不同 messages
export type ChatMsg =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  // assistant 这条有点特别：可能既带了 content（自然语言）又带了 tool_calls（决定）
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ChatMsgToolCall[];
    }
  // tool 这条是把执行结果回灌给模型；tool_call_id 必须对上 assistant 的 tool_calls[i].id
  | { role: "tool"; tool_call_id: string; content: string };

export type ChatMsgToolCall = {
  id: string;                              // 自生成 UUID；回灌 tool_result 时用
  type: "function";
  function: {
    name: string;                          // 决定调哪个工具
    arguments: string;                     // **是 JSON 字符串，不是对象**——这是常见踩坑点
  };
};

// ── 请求体（OpenAI Chat Completions API）──
//   注释标注每个字段的"是什么"+"为什么"。
export type ProtocolARequest = {
  model: string;       // 哪个模型（来自 apps/.env 的 LLM_MODEL 或该家默认）
  messages: ChatMsg[]; // 对话历史；step-2 里两轮各塞不同 messages
  tools?: ToolSchema[]; // 可用工具 schema（从 Registry 派生）
  // tool_choice 决定模型被允许怎么调工具：
  //   "auto"     = 模型自己决定调不调（最常用）
  //   "none"     = 强制不许调（用于纯对话 Demo）
  //   "required" = 强制必须调至少一个（§05-Tool-Calling-03 那一刀会讲）
  //   { type:"function", function:{ name } } = 强制调指定的那一个
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  temperature?: number; // 采样温度（默认 1.0；step-2 沿用 default）
};

// ── 响应体（OpenAI Chat Completions API）──
//   注释标注每个字段的"是什么"+"为什么"。
export type ProtocolAResponse = {
  id: string;          // 响应 ID（OpenAI 给的；排查 / 对账用）
  model: string;       // 实际响应的模型（可能和请求不一样——provider fallback）
  choices: Array<{
    index: number;             // 多 sample 时用；step-2 只取 0
    message: {                 // 助手的回复
      role: "assistant";
      content: string | null;  // 自然语言回复；模型决定调工具时可能为 null
      tool_calls?: ChatMsgToolCall[]; // 决定调的工具（结构化）；关键字段
    };
    // finish_reason 决定下一步动作：
    //   "stop"         = 正常文本结束 → 取 message.content 当 final_reply
    //   "tool_calls"   = 模型要调工具  → 拿 tool_calls[] 调 execute，再喂第二轮
    //   "length"       = 截断（max_tokens 不够）→ 通常意味着 prompt 太大
    //   "content_filter" = 内容被拦 → 通常意味着 prompt 越线
  finish_reason: "stop" | "tool_calls" | "length" | "content_filter";
  }>;
  usage: {                    // token 计费依据
    prompt_tokens: number;    // 本轮 prompt 用了多少 token
    completion_tokens: number; // 本轮回复用了多少 token
    total_tokens: number;      // prompt + completion
  };
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
  // openai SDK 的返回类型自带；强转让我们自己的 ProtocolAResponse 类型可控
  const response = (await llm.openai.chat.completions.create(request as never)) as unknown as ProtocolAResponse;
  logger.debug("protocol-a.done", "← got response", "协议 A 返回；完整打响应便于追 SDK 自带字段（id / choices / usage）", response);
  return response;
}
