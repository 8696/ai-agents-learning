/**
 * 职责：Tool Registry —— 注册 delete_user + 统一执行入口。
 * 数据流：tool_use { name, input } + tool_use_id + ToolContext → gatewayCheck → schema safeParse → handler → ExecResult。
 *
 * 教学锚点（覆盖本条 04 Tool Gateway）：
 *   - Tool 名 = delete_user；schema 用 Zod 校验参数；handler 内部走 Gateway 三钩子（鉴权/配额/危险）
 *   - 同协议 B 模型发 tool_use → executeTool → handler → 钩子链 → audit
 *   - 危险工具 dangerous: true（Registry 闸作为防御层；真正决定能不能执行的是 Gateway 三钩子）
 *
 * 独立性（§5.3.12）：本 Registry 不 import 同模块其它 step；只引本夹 lib/ + apps/llm.ts + apps/load-root-env.ts。
 *
 * 日志（§5.3.16）：gateway.rejected / zod.fail / execute.ok / execute.fail 四类都打。
 */
import { z } from "zod";
import { deleteUserTool } from "./delete-user.js";
import { logger } from "../logger.js";

// ── ToolContext：执行 Tool 时的上下文（actor 来自前端表单；confirmToken 来自二次确认 UI）──
export type ToolContext = {
  actor: { userId: string; role: "admin" | "user" };
  /** 前端二次确认 UI 给的 token；不填 → Gateway 危险钩子返 NEEDS_CONFIRM */
  confirmToken?: string;
};

// ── 注册表：name → Tool 完整定义 ──
const TOOLS = {
  [deleteUserTool.name]: deleteUserTool,
} as const;

export type ToolName = keyof typeof TOOLS;

export type HookTraceRow = {
  hook: "auth" | "quota" | "danger";
  allowed: boolean;
  reason: string;
  code?: string;
};

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
      code?: string;
      /** 限流撞线 / 二次确认等的等待毫秒数；模型下轮可据此等待再试（#14） */
      retryAfterMs?: number;
      hookTrace?: HookTraceRow[];
    };

// ── Registry 闸：防御性保留（模块 20 安全卡片会更深）──
function registryCheck(name: string): { allowed: boolean; reason?: string } {
  const tool = TOOLS[name as ToolName];
  if (!tool) {
    const reason = `unknown tool: ${name}（未注册）`;
    logger.warn("registry.gateway.rejected", "未注册工具", "LLM 想调的工具不在白名单；不能让未注册的工具被执行", { name, reason });
    return { allowed: false, reason };
  }
  if (tool.dangerous) {
    // 本 demo：delete_user 标 dangerous=true，但 Registry 不直接拦（真正的拦截在 handler 内部的 Gateway 钩子）
    // 这里留个 warn 作为「危险工具被 LLM 点名」的标记；让学习者看见 Registry 与 Gateway 的分工
    logger.debug("registry.gateway.dangerous-flagged", "dangerous 工具被点名", "工具标 dangerous：真正拦截在 handler 的 Gateway 钩子（鉴权/配额/危险）", {
      name,
    });
    return { allowed: true };
  }
  return { allowed: true };
}

// ── 统一执行入口 ──
export function executeTool(
  name: string,
  args: unknown,
  toolCallId: string,
  ctx: ToolContext,
): ExecResult {
  const gate = registryCheck(name);
  if (!gate.allowed) {
    return { ok: false, tool: name, tool_call_id: toolCallId, error: gate.reason ?? "registry rejected" };
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
    };
  }

  try {
    const raw = (tool.handler as (args: unknown, ctx: ToolContext) => unknown)(parsed.data, ctx);
    // handler 返结构化结果（带 hookTrace）；ExecResult 把 result/rawError 平铺
    if (typeof raw === "object" && raw !== null && "kind" in (raw as Record<string, unknown>)) {
      const r = raw as { kind: "ok" | "error"; payload?: unknown; message?: string; code?: string; hookTrace?: HookTraceRow[]; retryAfterMs?: number };
      if (r.kind === "ok") {
        logger.info("registry.execute.ok", "执行成功", "Tool 走完 Gateway 三钩子；打 hookTrace 摘要便于核对", {
          name,
          toolCallId,
          hookTrace: r.hookTrace,
        });
        return { ok: true, tool: name, tool_call_id: toolCallId, result: r.payload, hookTrace: r.hookTrace };
      }
      logger.warn("registry.execute.rejected", "Gateway 钩子拦截", "Tool 走到 Gateway 钩子时被拦；打 hookTrace + code + retryAfterMs 便于前端处理", {
        name,
        toolCallId,
        code: r.code,
        retryAfterMs: r.retryAfterMs,
        hookTrace: r.hookTrace,
      });
      return { ok: false, tool: name, tool_call_id: toolCallId, error: r.message ?? "gateway rejected", code: r.code, retryAfterMs: r.retryAfterMs, hookTrace: r.hookTrace };
    }
    // 兼容：handler 返普通对象
    logger.info("registry.execute.ok", "执行成功", "Tool 走完", { name, toolCallId });
    return { ok: true, tool: name, tool_call_id: toolCallId, result: raw };
  } catch (err: unknown) {
    logger.error("registry.execute.fail", "执行抛错", "handler 内部抛异常", { name, toolCallId, err: err instanceof Error ? err.message : String(err) });
    return {
      ok: false,
      tool: name,
      tool_call_id: toolCallId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── 元信息 / LLM schema 派生 ──
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
      properties[key] = { type: "number", description: `${key} 参数` };
      if (key === "reason") properties[key] = { type: "string", description: `${key} 参数` };
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