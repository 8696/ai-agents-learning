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
 * 日志（§5.3.16）：调用函数 五条日志（callProtocolA 封装层），调用模型 五条日志（真正发网络请求的那一层，含 __code + 字段释义）。
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
  const tFuncStart = Date.now();
  const llm = getLlm(); // 没 Key 直接抛——业务层 catch 兜底
  logger.info(
    "│ 协议A-callProtocolA",
    "调用函数开始：callProtocolA",
    "为什么写这条日志：route 只认这一层返回的 ProtocolAResponse；里面那次才是真发网络请求（看「调用模型开始：协议A-对话补全」）。当前：调 OpenAI 协议 A 发起请求；完整写 request 便于核对 model / messages / tools 字段是否齐。",
    {
      入参: { model: request.model, messagesCount: request.messages.length, toolsCount: request.tools?.length ?? 0, tool_choice: request.tool_choice },
      __code: `await llm.openai.chat.completions.create(${JSON.stringify(request, null, 2)});`,
    },
  );

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议A 对话补全",
    "调用模型开始：协议A 对话补全",
    "为什么写这条日志：本文件唯一真正发网络请求的那一层；不写就没有 id / choices / usage / finish_reason。当前：即将发出 chat.completions.create 请求。",
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
    // openai SDK 的返回类型自带；强转让我们自己的 ProtocolAResponse 类型可控
    const response = (await llm.openai.chat.completions.create(request as never)) as unknown as ProtocolAResponse;
    logger.info(
      "││ 调用模型-协议A 对话补全",
      "调用模型结束：协议A 对话补全",
      "为什么写这条日志：要拿 choices[0].finish_reason 决定下一步动作（stop / tool_calls / length / content_filter）；usage 是计费依据。当前：await 已返回。",
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
      "为什么写这条日志：route 要把 ProtocolAResponse 写进 ctx.body 交给页面 stats 区；记 id / model / finishReason 便于核对。",
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
      "为什么写这条日志：拿到 upstreamStatus 才能区分 401/403（Key）、429（限流）、5xx；未识别 → 500。当前：create 抛错，route 的 catch 会处理。",
      {
        返回值: { message: error instanceof Error ? error.message : String(error) },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    throw error;
  }
}