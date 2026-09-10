/**
 * 职责：本 step 的四个 mock 工具（查库存 / 写文案 / 通知运营 / 标完成待办）+ OpenAI tools 声明。
 * 数据流：flow 给出 { tool, args } → invokeTool → { ok, result }。
 * 为什么单独成文件：工具实现和「一步步走 / 先规划」控制流正交；短任务用 complete_todo。
 */

import type { ToolCall, ToolResult } from "../types.js";

const STOCK: Record<string, number> = { "SKU-88": 12, "SKU-89": 7, "SKU-90": 0 };
const TODOS: Record<string, { status: "pending" | "completed"; completedAt?: string }> = {
  "todo-001": { status: "pending" },
};

function queryStock(sku: string): { sku: string; available: number } {
  return { sku, available: STOCK[sku] ?? 0 };
}

function writeCopy(sku: string, copy: string): { sku: string; copy: string; ok: true } {
  return { sku, copy, ok: true };
}

function notifyOps(message: string): { delivered: true; message: string } {
  return { delivered: true, message };
}

function completeTodo(todoId: string): { todo_id: string; status: "completed"; completedAt: string } {
  TODOS[todoId] = { status: "completed", completedAt: new Date().toISOString() };
  return { todo_id: todoId, status: "completed", completedAt: TODOS[todoId].completedAt! };
}

type ToolImpl = (args: Record<string, unknown>) => unknown;

const TOOL_IMPLS: Record<string, ToolImpl> = {
  query_stock: (a) => queryStock(String(a.sku)),
  write_copy: (a) => writeCopy(String(a.sku), String(a.copy)),
  notify_ops: (a) => notifyOps(String(a.message)),
  complete_todo: (a) => completeTodo(String(a.todo_id)),
};

export const TOOLS_OPENAI = [
  { type: "function", function: { name: "query_stock", description: "查 SKU 库存。args: { sku }", parameters: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] } } },
  { type: "function", function: { name: "write_copy", description: "给 SKU 写文案。args: { sku, copy }", parameters: { type: "object", properties: { sku: { type: "string" }, copy: { type: "string" } }, required: ["sku", "copy"] } } },
  { type: "function", function: { name: "notify_ops", description: "通知运营。args: { message }", parameters: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } } },
  { type: "function", function: { name: "complete_todo", description: "把待办标完成。args: { todo_id }", parameters: { type: "object", properties: { todo_id: { type: "string" } }, required: ["todo_id"] } } },
];

export function invokeTool(call: ToolCall): ToolResult {
  const impl = TOOL_IMPLS[call.tool];
  if (!impl) return { tool: call.tool, args: call.args, result: { error: "unknown tool" }, ok: false };
  try {
    return { tool: call.tool, args: call.args, result: impl(call.args), ok: true };
  } catch (e) {
    return { tool: call.tool, args: call.args, result: { error: String(e) }, ok: false };
  }
}
