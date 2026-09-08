/**
 * 职责：Tool Registry —— 注册 read_recent_emails + 统一执行入口。
 * 数据流：tool_use { name, input } + tool_use_id + ToolContext → registryCheck → schema safeParse → handler → ExecResult。
 *
 * 教学锚点（覆盖本条 04 Tool Gateway · 变体 3）：
 *   - read_recent_emails：dangerous: false · handler 走 per-user OAuth + fail-closed（变体 3）
 *   - **不允许平台上帝 Key**：actor.userId === "platform-god" → 立即 FORBIDDEN
 *   - **未 OAuth 拒绝**：actor.userId 不在 oauth_tokens 表里 → FORBIDDEN
 *   - **per-user 资源隔离**：alice token 只返 alice 邮件，bob token 只返 bob 邮件
 *   - 单 Tool Registry（只 read_recent_emails）；变体 1 / 2 在 step-1 / step-2
 *
 * 独立性（§5.3.12）：本 Registry 不 import 同模块其它 step；只引本夹 lib/ + apps/llm.ts + apps/load-root-env.ts。
 *
 * 日志（§5.3.16）：registry.gateway / zod.fail / execute ok / execute.fail 四类都打。
 */
import { z } from "zod";
import { readRecentEmailsTool, getKnownOAuthUsers } from "./read-recent-emails.js";
import { logger } from "../logger.js";

// ── ToolContext：read_recent_emails 只需要 actor.userId + role ──
export type ToolContext = Record<string, unknown>;

// ── 注册表 ──
const TOOLS = {
  [readRecentEmailsTool.name]: readRecentEmailsTool,
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
      code?: string;
      hookTrace?: HookTraceRow[];
    };

// ── Registry 闸 ──
function registryCheck(name: string): { allowed: boolean; reason?: string } {
  const tool = TOOLS[name as ToolName];
  if (!tool) {
    const reason = `unknown tool: ${name}（未注册）`;
    logger.warn("registry.gateway.rejected", "未注册工具", "LLM 想调的工具不在白名单", { name, reason });
    return { allowed: false, reason };
  }
  return { allowed: true };
}

// ── 统一执行入口 ──
export function executeTool(
  name: string,
  args: unknown,
  toolCallId: string,
  _ctx: ToolContext,
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
    const raw = (tool.handler as (args: unknown, ctx: ToolContext) => unknown)(parsed.data, _ctx);
    if (typeof raw === "object" && raw !== null && "kind" in (raw as Record<string, unknown>)) {
      const r = raw as { kind: "ok" | "error"; payload?: unknown; message?: string; code?: string; hookTrace?: HookTraceRow[] };
      if (r.kind === "ok") {
        logger.info("registry.execute.ok", "执行成功", "Tool 走完", { name, toolCallId });
        return { ok: true, tool: name, tool_call_id: toolCallId, result: r.payload, hookTrace: r.hookTrace };
      }
      logger.warn("registry.execute.rejected", "Tool 内部鉴权拦截", "read_recent_emails handler 返 error（fail-closed 或未 OAuth）", {
        name,
        toolCallId,
        code: r.code,
      });
      return { ok: false, tool: name, tool_call_id: toolCallId, error: r.message ?? "tool rejected", code: r.code, hookTrace: r.hookTrace };
    }
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
      const desc = `${key} 参数`;
      if (key === "max") {
        properties[key] = { type: "number", description: "返回的最大邮件数（默认 5；上限 20）" };
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

// ── OAuth 用户列表（仅给 /health 用）──
export function getOAuthUsers() {
  return getKnownOAuthUsers();
}