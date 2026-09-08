/**
 * 职责：Tool Registry —— 注册 create_order + 统一执行入口。
 * 数据流：tool_use { name, input } + tool_use_id → registryCheck → schema safeParse → handler → ExecResult。
 *
 * 教学锚点（覆盖本条 04 Tool Gateway · 变体 2）：
 *   - create_order：dangerous: false · handler 走**幂等 cache + 内存 DB**（同 idempotency_key 调 3 次 → DB 只插 1 行）
 *   - 不走 Gateway 三钩子（创建订单不危险）
 *   - 单 Tool Registry：step-2 只演示变体 2（create_order 幂等）；变体 1 / 3 在 step-1 / step-3
 *
 * 独立性（§5.3.12）：本 Registry 不 import 同模块其它 step；只引本夹 lib/ + apps/llm.ts + apps/load-root-env.ts。
 *
 * 日志（§5.3.16）：registry.gateway / zod.fail / execute ok / execute.fail 四类都打。
 */
import { z } from "zod";
import { createOrderTool, getOrderCount, getCacheHits } from "./create-order.js";
import { logger } from "../logger.js";

// ── ToolContext：本 Tool 不需要 actor / confirmToken（创建订单不危险；幂等 key 客户端生成）──
export type ToolContext = Record<string, unknown>;

// ── 注册表 ──
const TOOLS = {
  [createOrderTool.name]: createOrderTool,
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

// ── Registry 闸：防御性保留 ──
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
      logger.warn("registry.execute.rejected", "Tool 内部抛错", "Tool 内部 handler 返 error", {
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
      if (key === "items") {
        properties[key] = {
          type: "array",
          description: "订单 items 数组，每项 { sku: string, qty: number }",
        };
      } else if (key === "idempotency_key") {
        properties[key] = { type: "string", description: "客户端生成的 UUID；同一意图同一 key" };
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

// ── 订单状态（仅给 /health 与 /api/order-demo 用）──
export function getOrderStats() {
  return { dbOrders: getOrderCount(), idempotencyCacheEntries: getCacheHits() };
}