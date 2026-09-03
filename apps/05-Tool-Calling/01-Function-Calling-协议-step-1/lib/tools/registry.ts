/**
 * 职责：Tool Registry —— 所有 Tool 的注册中心 + 统一执行入口 + Gateway 校验。
 * 数据流：tool_call { name, arguments } → gatewayCheck → schema safeParse → handler → ToolResult。
 * 为什么单独成文件：
 *   - 新增 Tool 不改核心代码（lib/tools/ 里加一个文件，registry 数组多挂一行）
 *   - 所有 Tool 共享同一道 Gateway（统一权限 / 配额 / 危险操作校验）
 *   - 业务端（routes/chat.ts）只面对 executeTool()，不直接 import 每个 Tool
 *
 * 教学锚点（这一刀覆盖 §05-Tool-Calling-04 Tool Gateway / 幂等的"请求 ≠ 执行"一刀）：
 *   模型发出 tool_call ≠ 允许执行 —— gatewayCheck 在 execute 前必须跑过；
 *   dangerous 工具 / 未注册工具都被拦下，回灌 tool_result 时返回 { ok:false, error } 让模型能自纠。
 */
import { getWeatherTool } from "./get-weather.js";
import { searchTool } from "./search.js";
import { calcTool } from "./calc.js";

// ── 注册表：name → Tool 完整定义 ──
// 新增 Tool 只要在这里多挂一行 + 在 lib/tools/ 加一个文件。其它代码不动。
const TOOLS = {
  [getWeatherTool.name]: getWeatherTool,
  [searchTool.name]: searchTool,
  [calcTool.name]: calcTool,
} as const;

export type ToolName = keyof typeof TOOLS;

export type ExecResult =
  | { ok: true; tool: string; tool_call_id: string; result: unknown }
  | { ok: false; tool: string; tool_call_id: string; error: string };

// ── Gateway 校验：模型"决定" ≠ "已执行"的关键 ──
// 生产里这里还应该做：用户鉴权、配额限流、白名单、敏感字段过滤、人类审批。
// 本 demo 只演示两道闸：未注册工具 + dangerous 工具。
function gatewayCheck(name: string): { allowed: boolean; reason?: string } {
  const tool = TOOLS[name as ToolName];
  if (!tool) {
    return { allowed: false, reason: `unknown tool: ${name}（未注册）` };
  }
  if (tool.dangerous) {
    return {
      allowed: false,
      reason: `dangerous tool ${name} requires manual approval（gateway 拒绝；本 demo 默认拦截）`,
    };
  }
  return { allowed: true };
}

// ── 统一执行入口：路由层调这一个函数 ──
// 真实场景里这层还应该包：超时（AbortController）、重试、埋点。
export function executeTool(
  name: string,
  args: unknown,
  toolCallId: string,
): ExecResult {
  // ① Gateway 先过
  const gate = gatewayCheck(name);
  if (!gate.allowed) {
    return { ok: false, tool: name, tool_call_id: toolCallId, error: gate.reason ?? "gateway rejected" };
  }

  // ② Zod 校验参数（防模型解析错 / 注入）
  const tool = TOOLS[name as ToolName];
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      tool: name,
      tool_call_id: toolCallId,
      error: `Zod parse failed: ${JSON.stringify(parsed.error.issues)}`,
    };
  }

  // ③ 真正执行
  // @ts-ignore
  return { ok: true, tool: name, tool_call_id: toolCallId, result: tool.handler(parsed.data) };
}

// ── 给前端"Registry 面板"用：列出所有 Tool 的元信息 ──
// 不返回 handler 实现，只返回声明（name / description / dangerous），避免把内部代码泄给浏览器。
export function getToolsMeta() {
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    dangerous: t.dangerous,
  }));
}

export function getToolNames(): ToolName[] {
  return Object.keys(TOOLS) as ToolName[];
}
