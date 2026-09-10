/**
 * 职责：真模型调用（拆出来的目的是让 loop.ts 控在 ≤280 行）。
 * 数据流：messages + tools schema → openai.chat.completions.create → 返回 finishReason + toolCall + content。
 * 为什么单独成文件：loop.ts 是本步核心；真模型调用是「主路径里的一个调用」，单独成文件便于阅读 + 控行数。
 *
 * step-3 用 openai Chat Completions（协议 A）；看真 finish_reason 决定闸门 3 是否触发。
 */
import OpenAI from "openai";
import { logger } from "../logger.js";

export interface LlmStepResult {
  finishReason: string;
  thought: string;
  toolCall: { name: string; args: Record<string, unknown> } | null;
  content: string | null;
  toolCallId: string | null;
}

export const TOOLS_SCHEMA: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "queryTodo",
      description: "查某个编号 todo 的详情（status + title + description）。",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "todo 编号，形如 T001 / T002 / T003 / ... / T010" },
        },
        required: ["id"],
      },
    },
  },
];

export const SYSTEM_PROMPT = `你是一个 todo 助手。用户会给你一个项目（如「电商购物助手」），需要查所有未完成 todo（status=pending，共 10 条 T001~T010）并给出最终建议。
请按以下流程调用工具：
1. 第一轮先调 queryTodo("T001") 看任务详情；用它的 status 决定下一步。
2. 如果 status=pending，继续调 queryTodo("T002") / T003 / ... / T010（**每次只查一个**，每个 id 一次）。
3. **不要跳过任何一个 id**（T001 ~ T010 都要查）。
4. **不要重复查同一个 id**（同 id 第二次查就是闸门 6 同工具同参数，要被拦）。
5. 10 个 todo 都查完后，**不要再调工具**，输出 final_answer 字段给一段总结（例如「final_answer: 共查 10 个 todo，建议先做 T003 和 T007」）。`;

/**
 * 真模型调用：发一次 Chat Completions 请求，返回本轮的 finishReason + toolCall + content。
 * 调用方拿到结果后决定下一步（break / 再调工具 / 累 messages）。
 */
export async function callRealLlmStep(
  openai: OpenAI,
  modelId: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): Promise<LlmStepResult> {
  const t0 = Date.now();
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么写这条日志：model_says_stop 闸要看真 finish_reason；不调模型就没这个信号。当前：messages 累积到本轮，看模型是调工具还是自己停。",
    { 入参: { messagesLen: messages.length, toolsLen: TOOLS_SCHEMA.length, model: modelId }, __code: "const resp = await openai.chat.completions.create({ model, messages, tools: TOOLS_SCHEMA });" },
  );
  const resp = await openai.chat.completions.create({
    model: modelId,
    messages,
    tools: TOOLS_SCHEMA,
  });
  const choice = resp.choices[0];
  const toolCall = choice.message.tool_calls?.[0] ?? null;
  const out: LlmStepResult = {
    finishReason: choice.finish_reason,
    thought: choice.message.content || (toolCall ? `模型决定调 ${toolCall.function.name}` : "模型未返回内容"),
    toolCall: toolCall
      ? { name: toolCall.function.name, args: JSON.parse(toolCall.function.arguments) }
      : null,
    content: choice.message.content,
    toolCallId: toolCall?.id ?? null,
  };
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型结束：对话补全",
    "为什么写这条日志：决定下一步是「break 还是再调工具」。当前：finishReason=" + out.finishReason + " · toolCall=" + (out.toolCall?.name ?? "none"),
    {
      返回值: { finishReason: out.finishReason, hasToolCall: Boolean(out.toolCall), contentLen: out.content?.length ?? 0 },
      耗时ms: Date.now() - t0,
      字段释义: {
        "choices[0].finish_reason": "tool_calls=要调工具；stop=模型主动结束",
        "choices[0].message.tool_calls": "要执行的函数名和参数",
      },
    },
  );
  return out;
}