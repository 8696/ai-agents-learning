/**
 * 职责：构造一条 ToolResultOut（成功/失败共用形状）。
 * 数据流：各步骤失败原因 → 统一 content 字符串，前端靠 parseOk/executeOk 上色。
 * 为什么：避免 execute 里到处手写同一大段对象字面量。
 */
import type { ToolResultOut } from "./round-types.js";

export function buildToolResult(opts: {
  toolCallId: string;
  toolName: string;
  content: string;
  parseOk: boolean;
  executeOk: boolean;
  rawArgs: unknown;
  durationMs: number;
}): ToolResultOut {
  return {
    tool_call_id: opts.toolCallId,
    role: "tool",
    content: opts.content,
    parseOk: opts.parseOk,
    executeOk: opts.executeOk,
    toolName: opts.toolName,
    rawArgs: opts.rawArgs,
    durationMs: opts.durationMs,
  };
}
