/**
 * 职责：一轮对话回给前端 / 拼进下一轮的数据结构。
 * 数据流：模型 tool_calls + 执行结果 → RoundOut；API JSON 与页面 RoundCard 对齐。
 */
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";

export type ToolResultOut = {
  tool_call_id: string;
  role: "tool";
  content: string;
  parseOk: boolean;
  executeOk: boolean;
  toolName: string;
  rawArgs: unknown;
  durationMs: number;
};

export type RoundOut = {
  round: number;
  finish_reason: string | null;
  content: string | null;
  tool_calls: Array<{ id: string; function: { name: string; arguments: string } }>;
  toolResults: ToolResultOut[];
  /** simulate-zod-error 第一轮会标 true，页面显示「服务端篡改」 */
  tampered?: boolean;
};

/** 去掉 SDK 多余字段，只留页面需要的 name/arguments。 */
export function slimToolCalls(
  tcs: ChatCompletionMessageToolCall[],
): RoundOut["tool_calls"] {
  return tcs.map((tc) => ({
    id: tc.id,
    function: { name: tc.function.name, arguments: tc.function.arguments },
  }));
}
