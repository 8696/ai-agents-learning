/**
 * 职责：Agent Loop 用到的类型（ToolCallLite / TrajectoryStep / LoopResult / ChatMessage）。
 *
 * 数据流：routes/agent.ts 用 ChatMessage 拼 initialMessages → loop.ts 产出 TrajectoryStep[] + LoopResult。
 *
 * 为什么单独成文件：类型不是控制流。loop.ts 只保留 while + Reason + 停止条件（含 cancelled）。
 *
 * **关键修复（2026-09-10）**：之前自定义 ChatMessage 把 assistant 的 tool_calls 字段命名为 `tc`，
 * 发请求时强转。OpenAI SDK 序列化只认 `tool_calls` —— 字段整体丢失，下一圈对不上 tool_call_id → 400。
 * 修复：直接用 SDK 原生 ChatCompletionMessageParam，字段名永远正确。
 */

import type OpenAI from "openai";

export type ToolCallLite = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

export type TrajectoryStep = {
  round: number;
  assistant: {
    content: string | null;
    tc: ToolCallLite[];
  };
  toolResults: Array<{
    tool_call_id: string;
    name: string;
    arguments: unknown;
    content: string;
  }>;
  elapsedMs: number;
};

export type LoopResult = {
  trajectory: TrajectoryStep[];
  finalAnswer: string;
  /** final_answer（变体 J）/ max_rounds（兜底）/ cancelled（变体 M · step-4 主教学点） */
  stoppedReason: "final_answer" | "max_rounds" | "cancelled";
  rounds: number;
  finalMessages: ChatMessage[];
};

export type RunLoopParams = {
  openai: OpenAI;
  model: string;
  initialMessages: ChatMessage[];
  maxRounds?: number;
  /** step-4：AbortSignal。routes/cancel.ts 触发 abort() 后，下一次 LLM 调用立刻抛 AbortError。 */
  signal?: AbortSignal;
};
