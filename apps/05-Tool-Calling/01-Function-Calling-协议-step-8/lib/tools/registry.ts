/**
 * 职责：Tool Registry —— 3 个 Tool + 统一执行入口 + Gateway 校验。
 * 数据流：tool_call { name, arguments } → gatewayCheck → schema safeParse → handler → ToolResult。
 *
 * step-8 vs step-6：step-8 用协议 B（Anthropic Messages API），但 Registry 完全一样（SDK 无关中间层）。
 *
 * 日志（§5.3.16）：executeTool 是核心档——函数体逐步打满五件套（含 __code + 字段释义）；
 *   gatewayCheck / getToolsMeta / getToolsForLLM 是工具档——五件套（含 __code）仍要。
 */
import { z } from "zod";
import { getWeatherTool } from "./get-weather.js";
import { searchTool } from "./search.js";
import { calcTool } from "./calc.js";
import { logger } from "../logger.js";

// ── 注册表：name → Tool 完整定义 ──
const TOOLS = {
  [getWeatherTool.name]: getWeatherTool,
  [searchTool.name]: searchTool,
  [calcTool.name]: calcTool,
} as const;

export type ToolName = keyof typeof TOOLS;

export type ExecResult =
  | { ok: true; tool: string; tool_call_id: string; result: unknown }
  | { ok: false; tool: string; tool_call_id: string; error: string };

// ── Gateway 校验 ──
function gatewayCheck(name: string): { allowed: boolean; reason?: string } {
  const tool = TOOLS[name as ToolName];
  if (!tool) {
    const reason = `unknown tool: ${name}（未注册）`;
    logger.warn(
      "│ 网关-gatewayCheck",
      "调用函数结束：gatewayCheck",
      "为什么打：未注册工具被拦；LLM 想调的工具不在白名单。warn 是「业务失败但能走通」的等级。",
      {
        返回值: { allowed: false, reason },
        name,
        耗时ms: Date.now(),
      },
    );
    return { allowed: false, reason };
  }
  if (tool.dangerous) {
    const reason = `dangerous tool ${name} requires manual approval`;
    logger.warn(
      "│ 网关-gatewayCheck",
      "调用函数结束：gatewayCheck（dangerous）",
      "为什么打：工具被标 dangerous；即使 LLM 提到也直接拦掉。",
      {
        返回值: { allowed: false, reason },
        name,
        耗时ms: Date.now(),
      },
    );
    return { allowed: false, reason };
  }
  logger.debug(
    "│ 网关-gatewayCheck",
    "调用函数结束：gatewayCheck",
    "为什么打：debug 是「细节」等级；gateway 放行是高频路径。",
    {
      返回值: { allowed: true },
      name,
      耗时ms: Date.now(),
    },
  );
  return { allowed: true };
}

// ── 统一执行入口 ──
export function executeTool(
  name: string,
  args: unknown,
  toolCallId: string,
): ExecResult {
  const tFuncStart = Date.now();
  logger.info(
    "│ 工具执行-executeTool",
    "调用函数开始：executeTool",
    "为什么打：route 只认这一层返回的 ExecResult；所有 Tool 共用同一道 Gateway。",
    {
      入参: { toolCallId, name, rawArgs: args },
      __code: `const gate = gatewayCheck(name);\nconst parsed = tool.schema.safeParse(args);\nreturn { ok: true, ..., result: tool.handler(parsed.data) };`,
    },
  );

  const gate = gatewayCheck(name);
  if (!gate.allowed) {
    logger.warn(
      "│ 工具执行-executeTool",
      "调用函数结束：executeTool（gateway 拒绝）",
      "为什么打：未注册工具或 dangerous 工具被拦；回灌 tool_result 时返回 ok:false 让模型能自纠。",
      {
        返回值: { ok: false, tool: name, tool_call_id: toolCallId, error: gate.reason ?? "gateway rejected" },
        reason: gate.reason,
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return { ok: false, tool: name, tool_call_id: toolCallId, error: gate.reason ?? "gateway rejected" };
  }

  const tool = TOOLS[name as ToolName];
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    logger.warn(
      "│ 工具执行-executeTool",
      "调用函数结束：executeTool（Zod 校验失败）",
      "为什么打：工具名合法但参数 schema 不匹配。",
      {
        返回值: { ok: false, tool: name, tool_call_id: toolCallId, error: `Zod parse failed: ${JSON.stringify(issues)}` },
        issues: JSON.parse(JSON.stringify(issues)),
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return {
      ok: false,
      tool: name,
      tool_call_id: toolCallId,
      error: `Zod parse failed: ${JSON.stringify(issues)}`,
    };
  }

  try {
    // @ts-ignore —— 三个 Tool 的 handler 签名不同，TS 看成联合；运行时安全（Zod 已校验）
    const result = tool.handler(parsed.data);
    logger.info(
      "│ 工具执行-executeTool",
      "调用函数结束：executeTool",
      "为什么打：工具实际跑通；只打 result 摘要。",
      {
        返回值: { ok: true, tool: name, tool_call_id: toolCallId, resultPreview: summarize(result) },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return { ok: true, tool: name, tool_call_id: toolCallId, result };
  } catch (err: unknown) {
    logger.error(
      "│ 工具执行-executeTool",
      "调用函数结束：executeTool（失败）",
      "为什么打：handler 内部抛异常；回灌 tool_result 时按失败处理，不让外层断片。",
      {
        返回值: { ok: false, tool: name, tool_call_id: toolCallId, error: err instanceof Error ? err.message : String(err) },
        耗时ms: Date.now() - tFuncStart,
        错误: err,
      },
    );
    return { ok: false, tool: name, tool_call_id: toolCallId, error: err instanceof Error ? err.message : String(err) };
  }
}

function summarize(v: unknown): unknown {
  try {
    const s = JSON.stringify(v);
    if (s.length <= 200) return v;
    return JSON.parse(s.slice(0, 200) + "…");
  } catch {
    return String(v).slice(0, 200);
  }
}

// ── 元信息 / LLM schema 派生 ──
export function getToolsMeta() {
  const t0 = Date.now();
  const meta = Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    dangerous: t.dangerous,
  }));
  logger.debug(
    "│ Registry-getToolsMeta",
    "调用函数结束：getToolsMeta",
    "为什么打：debug 是「细节」等级；前端 Tool Registry 面板拉一次是高频路径。",
    {
      返回值: { count: meta.length, tools: meta },
      耗时ms: Date.now() - t0,
    },
  );
  return meta;
}

function buildParametersJsonSchema(schema: z.ZodTypeAny): {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required: string[];
} {
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, { type: string; description?: string }> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(schema.shape)) {
      properties[key] = { type: "string", description: `${key} 参数` };
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }
    return { type: "object", properties, required };
  }
  return { type: "object", properties: {}, required: [] };
}

export function getToolsForLLM() {
  const t0 = Date.now();
  const tools = Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    dangerous: t.dangerous,
    parameters: buildParametersJsonSchema(t.schema),
  }));
  logger.debug(
    "│ Registry-getToolsForLLM",
    "调用函数结束：getToolsForLLM",
    "为什么打：debug 是「细节」等级；tools 在 chat.ts 启动时一次性派生，缓存用。",
    {
      返回值: { count: tools.length, tools },
      耗时ms: Date.now() - t0,
    },
  );
  return tools;
}