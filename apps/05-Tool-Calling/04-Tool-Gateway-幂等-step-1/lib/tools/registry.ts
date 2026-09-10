/**
 * 职责：Tool Registry —— 注册 delete_user + 统一执行入口。
 * 数据流：tool_use { name, input } + tool_use_id + ToolContext → gatewayCheck → schema safeParse → handler → ExecResult。
 *
 * 日志（§5.3.16）：executeTool 是主路径——函数体逐步写满五条日志（含 __code + 字段释义）；
 *   registryCheck / getToolsMeta / getToolsForLLM 是普通函数——五条日志（含 __code）仍要。
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
      retryAfterMs?: number;
      hookTrace?: HookTraceRow[];
    };

// ── Registry 闸：防御性保留（模块 20 安全卡片会更深）──
function registryCheck(name: string): { allowed: boolean; reason?: string } {
  const tFuncStart = Date.now();
  const tool = TOOLS[name as ToolName];
  if (!tool) {
    const reason = `unknown tool: ${name}（未注册）`;
    logger.warn(
      "│ 网关-registryCheck",
      "调用函数结束：registryCheck",
      "为什么写这条日志：未注册工具被拦；LLM 想调的工具不在白名单。warn 是「业务失败但能走通」的等级。",
      {
        返回值: { allowed: false, reason },
        name,
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return { allowed: false, reason };
  }
  if (tool.dangerous) {
    logger.debug(
      "│ 网关-registryCheck",
      "调用函数结束：registryCheck（dangerous）",
      "为什么写这条日志：debug 是「细节」等级；工具标 dangerous：真正拦截在 handler 的 Gateway 钩子（鉴权/配额/危险），Registry 留个 warn 标记。",
      {
        返回值: { allowed: true },
        name,
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return { allowed: true };
  }
  logger.debug(
    "│ 网关-registryCheck",
    "调用函数结束：registryCheck",
    "为什么写这条日志：debug 是「细节」等级；普通工具放行。",
    {
      返回值: { allowed: true },
      name,
      耗时ms: Date.now() - tFuncStart,
    },
  );
  return { allowed: true };
}

// ── 统一执行入口 ──
export function executeTool(
  name: string,
  args: unknown,
  toolCallId: string,
  ctx: ToolContext,
): ExecResult {
  const tFuncStart = Date.now();
  logger.info(
    "│ 工具执行-executeTool",
    "调用函数开始：executeTool",
    "为什么写这条日志：route 只认这一层返回的 ExecResult；里面那次才是出 handler 内部 Gateway 钩子。当前：教学锚点——不是「模型发 tool_use 就执行」，是「executeTool 内部走 Gateway 三钩子」。",
    {
      入参: { name, toolCallId, argsPreview: args, actor: ctx.actor, hasConfirmToken: Boolean(ctx.confirmToken) },
      __code: `const gate = registryCheck(name);\nconst parsed = tool.schema.safeParse(args);\nconst raw = (tool.handler as ...)(parsed.data, ctx);`,
    },
  );

  const gate = registryCheck(name);
  if (!gate.allowed) {
    logger.warn(
      "│ 工具执行-executeTool",
      "调用函数结束：executeTool（Registry 拒绝）",
      "为什么写这条日志：未注册工具被拦；回灌 tool_result 时返回 ok:false 让模型能自纠。",
      {
        返回值: { ok: false, tool: name, tool_call_id: toolCallId, error: gate.reason ?? "registry rejected" },
        reason: gate.reason,
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return { ok: false, tool: name, tool_call_id: toolCallId, error: gate.reason ?? "registry rejected" };
  }

  const tool = TOOLS[name as ToolName];
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    logger.warn(
      "│ 工具执行-executeTool",
      "调用函数结束：executeTool（Zod 校验失败）",
      "为什么写这条日志：工具名合法但参数 schema 不匹配；记 issues 便于排错。",
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
    const raw = (tool.handler as (args: unknown, ctx: ToolContext) => unknown)(parsed.data, ctx);
    if (typeof raw === "object" && raw !== null && "kind" in (raw as Record<string, unknown>)) {
      const r = raw as { kind: "ok" | "error"; payload?: unknown; message?: string; code?: string; hookTrace?: HookTraceRow[]; retryAfterMs?: number };
      if (r.kind === "ok") {
        logger.info(
          "│ 工具执行-executeTool",
          "调用函数结束：executeTool",
          "为什么写这条日志：Tool 走完 Gateway 三钩子；打 hookTrace 摘要便于核对。",
          {
            返回值: { ok: true, tool: name, tool_call_id: toolCallId, hookTrace: r.hookTrace },
            耗时ms: Date.now() - tFuncStart,
          },
        );
        return { ok: true, tool: name, tool_call_id: toolCallId, result: r.payload, hookTrace: r.hookTrace };
      }
      logger.warn(
        "│ 工具执行-executeTool",
        "调用函数结束：executeTool（Gateway 拒绝）",
        "为什么写这条日志：Tool 走到 Gateway 钩子时被拦；打 hookTrace + code + retryAfterMs 便于前端处理。",
        {
          返回值: { ok: false, tool: name, tool_call_id: toolCallId, error: r.message ?? "gateway rejected", code: r.code, retryAfterMs: r.retryAfterMs, hookTrace: r.hookTrace },
          耗时ms: Date.now() - tFuncStart,
        },
      );
      return { ok: false, tool: name, tool_call_id: toolCallId, error: r.message ?? "gateway rejected", code: r.code, retryAfterMs: r.retryAfterMs, hookTrace: r.hookTrace };
    }
    logger.info(
      "│ 工具执行-executeTool",
      "调用函数结束：executeTool",
      "为什么写这条日志：兼容——handler 返普通对象；Tool 走完。",
      {
        返回值: { ok: true, tool: name, tool_call_id: toolCallId },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return { ok: true, tool: name, tool_call_id: toolCallId, result: raw };
  } catch (err: unknown) {
    logger.error(
      "│ 工具执行-executeTool",
      "调用函数结束：executeTool（失败）",
      "为什么写这条日志：handler 内部抛异常；回灌 tool_result 时按失败处理。",
      {
        返回值: { ok: false, tool: name, tool_call_id: toolCallId, error: err instanceof Error ? err.message : String(err) },
        耗时ms: Date.now() - tFuncStart,
        错误: err,
      },
    );
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
  const t0 = Date.now();
  const meta = Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    dangerous: t.dangerous,
  }));
  logger.debug(
    "│ Registry-getToolsMeta",
    "调用函数结束：getToolsMeta",
    "为什么写这条日志：debug 是「细节」等级；前端 Tool Registry 面板拉一次是高频路径。",
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
    "为什么写这条日志：debug 是「细节」等级；tools 在 chat.ts 启动时一次性派生，缓存用。",
    {
      返回值: { count: tools.length, tools },
      耗时ms: Date.now() - t0,
    },
  );
  return tools;
}