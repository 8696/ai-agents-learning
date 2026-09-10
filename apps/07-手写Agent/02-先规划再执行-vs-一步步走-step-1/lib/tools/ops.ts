/**
 * 职责：本 step 的三个 mock 工具（查库存 / 写文案 / 通知运营）。不接真业务。
 * 数据流：flow 给出 { tool, args } → invokeTool → { ok, result }。
 * 为什么单独成文件：工具实现和「一步步走 / 先规划」控制流正交；两侧 flow 共用这一份。
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

export function invokeTool(call: ToolCall): ToolResult {
  const impl = TOOL_IMPLS[call.tool];
  if (!impl) return { tool: call.tool, args: call.args, result: { error: "unknown tool" }, ok: false };
  try {
    return { tool: call.tool, args: call.args, result: impl(call.args), ok: true };
  } catch (e) {
    return { tool: call.tool, args: call.args, result: { error: String(e) }, ok: false };
  }
}
