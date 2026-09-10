/**
 * 职责：Agent Loop 用到的类型（ToolCallLite / TrajectoryStep / LoopResult / ChatMessage）。
 *
 * 数据流：routes/agent.ts 用 ChatMessage 拼 initialMessages → loop.ts 产出 TrajectoryStep[] + LoopResult。
 *
 * 为什么单独成文件：类型不是控制流。loop.ts 只保留 while + Reason + 停止条件，避免和执行工具的代码挤在一起。
 *
 * **关键修复（2026-09-10）**：之前自定义 ChatMessage 把 assistant 的 tool_calls 字段命名为 `tc`，
 * 发请求时强转。OpenAI SDK 序列化只认 `tool_calls` —— 字段整体丢失，下一圈对不上 tool_call_id → 400。
 * 修复：直接用 SDK 原生 ChatCompletionMessageParam，字段名永远正确。
 */

import type OpenAI from "openai";

/** 简化版 tool_call：loop 自己用，跟 openai 的类型解耦。 */
export type ToolCallLite = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

/** 一圈的可观察产物：给前端 / 日志看的轨迹 */
export type TrajectoryStep = {
  round: number;
  /** Reason 阶段：模型返回的 assistant 消息（content + tool_calls） */
  assistant: {
    content: string | null;
    tc: ToolCallLite[];
  };
  /** Act + Observe 阶段：本圈每个 tool_call 的执行结果；空数组 = 没 Act */
  toolResults: Array<{
    tool_call_id: string;
    name: string;
    arguments: unknown;
    content: string;
  }>;
  /** 这一圈耗时（毫秒；含 LLM 调用 + tool 执行） */
  elapsedMs: number;
};

export type LoopResult = {
  trajectory: TrajectoryStep[];
  finalAnswer: string;
  /** 解释为什么停：final_answer | max_rounds */
  stoppedReason: "final_answer" | "max_rounds";
  rounds: number;
  /** 跑完后 messages 数组（含 system / user / 多圈 assistant+tool）—— 给前端做「完整 Context」展示 */
  finalMessages: ChatMessage[];
};

export type RunLoopParams = {
  openai: OpenAI;
  model: string;
  initialMessages: ChatMessage[];
  /** 兜底；打到就停，不抛错。本条演示默认 6，足够 list + 1~2 complete + 最终答案。 */
  maxRounds?: number;
};
