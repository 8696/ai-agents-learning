/**
 * 职责：本 step 的三个 mock 工具；write_copy 第 1 次强制失败（变体 E）。
 * 数据流：flow 给出 { tool, args } → invokeTool → { ok, result }；FAIL_ON_CALL 命中则 ok=false。
 * 为什么单独成文件：强制失败逻辑属于工具层，不该散落在执行循环里。
 */

import type { ToolCall, ToolResult } from "../types.js";

const STOCK: Record<string, number> = { "SKU-88": 12, "SKU-89": 7, "SKU-90": 0 };

function queryStock(sku: string): { sku: string; available: number } {
  return { sku, available: STOCK[sku] ?? 0 };
}

function writeCopy(sku: string, copy: string): { sku: string; copy: string; ok: true } {
  return { sku, copy, ok: true };
}

function notifyOps(message: string): { delivered: true; message: string } {
  return { delivered: true, message };
}

type ToolImpl = (args: Record<string, unknown>) => unknown;

const TOOL_IMPLS: Record<string, ToolImpl> = {
  query_stock: (a) => queryStock(String(a.sku)),
  write_copy: (a) => writeCopy(String(a.sku), String(a.copy)),
  notify_ops: (a) => notifyOps(String(a.message)),
};

export const TOOLS_OPENAI = [
  { type: "function", function: { name: "query_stock", description: "查 SKU 库存。args: { sku }", parameters: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] } } },
  { type: "function", function: { name: "write_copy", description: "给 SKU 写文案。args: { sku, copy }", parameters: { type: "object", properties: { sku: { type: "string" }, copy: { type: "string" } }, required: ["sku", "copy"] } } },
  { type: "function", function: { name: "notify_ops", description: "通知运营。args: { message }", parameters: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } } },
];

/** write_copy 第 1 次调用强制失败；shouldReplan 不看 ok=false → 按旧清单继续做错 */
const FAIL_ON_CALL: Record<string, number> = { write_copy: 1 };
const callCounters: Record<string, number> = {};

export function resetFailCounters(): void {
  for (const k of Object.keys(callCounters)) delete callCounters[k];
}

export function invokeTool(call: ToolCall): ToolResult {
  const toolName = call.tool;
  callCounters[toolName] = (callCounters[toolName] || 0) + 1;

  if (FAIL_ON_CALL[toolName] && callCounters[toolName] === FAIL_ON_CALL[toolName]) {
    return {
      tool: toolName,
      args: call.args,
      result: { error: `mock 强制失败：${toolName} 第 ${callCounters[toolName]} 次调用（变体 E：工具失败 → shouldReplan 不看 ok=false → 不重规划 → 按旧清单继续做错）` },
      ok: false,
    };
  }

  const impl = TOOL_IMPLS[toolName];
  if (!impl) return { tool: toolName, args: call.args, result: { error: "unknown tool" }, ok: false };
  try {
    return { tool: toolName, args: call.args, result: impl(call.args), ok: true };
  } catch (e) {
    return { tool: toolName, args: call.args, result: { error: String(e) }, ok: false };
  }
}
