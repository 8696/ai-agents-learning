/**
 * 职责：Tool Registry —— 注册 divide + lookup_user + 统一执行接口。
 * 数据流：tool_use { name, input } + tool_use_id + ToolContext → registryCheck → schema safeParse → handler → ExecResult。
 *
 * 教学锚点（覆盖本条 04 Tool Gateway · 变体 4）：
 *   - divide：handler b=0 throw → registry.try/catch 捕获 → 包装结构化错误 → 模型下轮改输入
 *   - lookup_user：handler user 不存在 throw → 同上路径
 *   - **业务错误 ≠ HTTP 500**：handler throw → 中间件捕获 → 返结构化 tool_result，**整轮 agent 不挂**
 *   - **handler 也可以返 {kind:\"error\", code, message, retryable}**（不 throw 也走结构化路径）
 *
 * 独立性（：本 Registry 不 import 同模块其它 step；只引本夹 lib/ + apps/llm.ts + apps/load-root-env.ts。
 *
 * 日志（：registry.gateway / zod.fail / execute ok / execute.fail（throw 走 fail 路径）都打。
 */
import { z } from "zod";
import { divideTool } from "./divide.js";
import { logger } from "../logger.js";

export type ToolContext = Record<string, unknown>;

const TOOLS = {
  [divideTool.name]: divideTool,
} as const;

export type ToolName = keyof typeof TOOLS;

export type HookTraceRow = never;

export type ExecResult =
  | {
      ok: true;
      tool: string;
      tool_call_id: string;
      result: unknown;
      hookTrace?: HookTraceRow[];
    }
  | {
      ok: false;
      tool: string;
      tool_call_id: string;
      error: string;
      /** 结构化错误码：DIVIDE_BY_ZERO / USER_NOT_FOUND / TOOL_THREW / INVALID_PARAM */
      code?: string;
      /** 错误性质：业务错误 vs 基础设施错误 */
      status?: "error";
      /** 模型下轮是否可以改输入重试 */
      retryable?: boolean;
      hookTrace?: HookTraceRow[];
    };

function registryCheck(name: string): { allowed: boolean; reason?: string } {
  const tool = TOOLS[name as ToolName];
  if (!tool) {
    const reason = `unknown tool: ${name}（未注册）`;
    logger.warn("registry.gateway.rejected", "未注册工具", "LLM 想调的工具不在白名单", { name, reason });
    return { allowed: false, reason };
  }
  return { allowed: true };
}

export function executeTool(
  name: string,
  args: unknown,
  toolCallId: string,
  _ctx: ToolContext,
): ExecResult {
  const gate = registryCheck(name);
  if (!gate.allowed) {
    return { ok: false, tool: name, tool_call_id: toolCallId, error: gate.reason ?? "registry rejected", code: "TOOL_NOT_REGISTERED", status: "error", retryable: false };
  }

  const tool = TOOLS[name as ToolName];
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    logger.warn("registry.zod.fail", "参数 Zod 校验失败", "工具名合法但参数 schema 不匹配", { name, toolCallId, issues });
    return {
      ok: false,
      tool: name,
      tool_call_id: toolCallId,
      error: `Zod parse failed: ${JSON.stringify(issues)}`,
      code: "INVALID_PARAM",
      status: "error",
      retryable: true, // 参数错可改输入重试
      hookTrace: [],
    };
  }

  try {
    const raw = (tool.handler as (args: unknown, ctx: ToolContext) => unknown)(parsed.data, _ctx);
    if (typeof raw === "object" && raw !== null && "kind" in (raw as Record<string, unknown>)) {
      const r = raw as { kind: "ok" | "error"; payload?: unknown; message?: string; code?: string; hookTrace?: HookTraceRow[]; retryable?: boolean };
      if (r.kind === "ok") {
        logger.info("registry.execute.ok", "执行成功", "Tool 走完", { name, toolCallId });
        return { ok: true, tool: name, tool_call_id: toolCallId, result: r.payload, hookTrace: r.hookTrace };
      }
      logger.warn("registry.execute.rejected", "Tool 内部返 error", "handler 内部返 {kind:\"error\"}（不 throw）→ 结构化路径", {
        name,
        toolCallId,
        code: r.code,
      });
      return { ok: false, tool: name, tool_call_id: toolCallId, error: r.message ?? "tool rejected", code: r.code, status: "error", retryable: r.retryable ?? false, hookTrace: r.hookTrace };
    }
    logger.info("registry.execute.ok", "执行成功", "Tool 走完", { name, toolCallId });
    return { ok: true, tool: name, tool_call_id: toolCallId, result: raw };
  } catch (err: unknown) {
    // ── ★ handler throw → 中间件捕获 → 结构化错误 → 整轮 agent 不挂 ──
    const e = err as { message?: string };
    const message = e.message ?? String(err);
    // 简单从 message 推断 code（演示用；生产用 Error 子类或错误码 enum）
    let code = "TOOL_THREW";
    let retryable = false;
    if (message.indexOf("divide by zero") >= 0) { code = "DIVIDE_BY_ZERO"; retryable = true; }
    else if (message.indexOf("user not found") >= 0) { code = "USER_NOT_FOUND"; retryable = false; }
    logger.error("registry.execute.fail", "handler 抛错 → 中间件捕获", "★ 变体 4 教学点：业务错误 → 结构化 tool_result，不抛 HTTP 500", {
      name,
      toolCallId,
      errorMessage: message,
      code,
      retryable,
    });
    return {
      ok: false,
      tool: name,
      tool_call_id: toolCallId,
      error: message,
      code,
      status: "error",
      retryable,
      hookTrace: [],
    };
  }
}

export function getToolsMeta() {
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    dangerous: t.dangerous,
  }));
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
      const desc = `${key} 参数`;
      if (key === "a" || key === "qty") {
        properties[key] = { type: "number", description: desc };
      } else {
        properties[key] = { type: "string", description: desc };
      }
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }
    return { type: "object", properties, required };
  }
  return { type: "object", properties: {}, required: [] };
}

export function getToolsForLLM() {
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    dangerous: t.dangerous,
    parameters: buildParametersJsonSchema(t.schema),
  }));
}