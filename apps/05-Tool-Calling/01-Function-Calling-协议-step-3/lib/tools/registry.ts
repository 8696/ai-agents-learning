/**
 * 职责：Tool Registry —— 3 个 Tool + 统一执行入口 + Gateway 校验。
 * 数据流：tool_call { name, arguments } → gatewayCheck → schema safeParse → handler → ToolResult。
 * 为什么单独成文件：
 *   - 新增 Tool 不改核心代码（lib/tools/ 里加一个文件，registry 数组多挂一行）
 *   - 所有 Tool 共享同一道 Gateway（统一权限 / 配额 / 危险操作校验）
 *   - 业务端（routes/plan.ts）只面对 executeTool()，不直接 import 每个 Tool
 *
 * step-3 vs step-1/2：本 Registry 的 3 个 Tool 都不一样（旅游规划场景），且 handler **全 async**。
 *   独立性（§5.3.12）：本 Registry 不 import step-1/2 的 tools；step-3 是独立 mock demo。
 *
 * 教学锚点（覆盖模块 05 · 01 · 需求 1「含并行调用」 + 需求 2「串/并行对比」）：
 *   - executeTool 仍是同步外壳，但 handler 是 async → 路由层要 await
 *   - Gateway / Zod 仍在 execute 路径上，**不**因为并行就跳过
 *
 * 日志（§5.3.16）：executeTool 是主路径——函数体逐步写满五条日志（含 __code + 字段释义）；
 *   gatewayCheck / getToolsMeta / planToolCalls 是普通函数——五条日志（含 __code）仍要。
 */
import { searchFlightTool } from "./search-flight.js";
import { getWeatherTool } from "./get-weather.js";
import { getPackingListTool } from "./get-packing-list.js";
import { logger } from "../logger.js";

// ── 注册表：name → Tool 完整定义 ──
const TOOLS = {
  [searchFlightTool.name]: searchFlightTool,
  [getWeatherTool.name]: getWeatherTool,
  [getPackingListTool.name]: getPackingListTool,
} as const;

export type ToolName = keyof typeof TOOLS;

export type ExecResult =
  | { ok: true; tool: string; tool_call_id: string; result: unknown }
  | { ok: false; tool: string; tool_call_id: string; error: string };

// ── Gateway 校验：模型"决定" ≠ "已执行"的关键 ──
// step-3 三个 Tool 都不是 dangerous，这里只演示"未注册工具被拦"。
function gatewayCheck(name: string): { allowed: boolean; reason?: string } {
  const tool = TOOLS[name as ToolName];
  if (!tool) {
    const reason = `unknown tool: ${name}（未注册）`;
    logger.warn(
      "│ 网关-gatewayCheck",
      "调用函数结束：gatewayCheck",
      "为什么写这条日志：未注册工具被拦；LLM 想调的工具不在白名单；不能让未注册的工具被执行。warn 是「业务失败但能走通」的等级。",
      {
        返回值: { allowed: false, reason },
        name,
        耗时ms: Date.now(),
      },
    );
    return { allowed: false, reason };
  }
  if (tool.dangerous) {
    const reason = `dangerous tool ${name} requires manual approval（gateway 拒绝）`;
    logger.warn(
      "│ 网关-gatewayCheck",
      "调用函数结束：gatewayCheck（dangerous）",
      "为什么写这条日志：工具被标 dangerous；即使 LLM 提到也直接拦掉。",
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
    "为什么写这条日志：debug 是「细节」等级；gateway 放行是高频路径，命中 ok 时不写 info 免刷屏。",
    {
      返回值: { allowed: true },
      name,
      dangerous: tool.dangerous,
      耗时ms: Date.now(),
    },
  );
  return { allowed: true };
}

// ── 统一执行入口：路由层调这一个函数 ──
// 注意：返回 Promise（handler 是 async）；路由层自己决定 await 还是 Promise.all。
export async function executeTool(
  name: string,
  args: unknown,
  toolCallId: string,
): Promise<ExecResult> {
  const tFuncStart = Date.now();
  logger.info(
    "│ 工具执行-executeTool",
    "调用函数开始：executeTool",
    "为什么写这条日志：route 只认这一层返回的 ExecResult；所有 Tool 共用同一道 Gateway。当前：handler 是 async → 路由层自己决定 await 还是 Promise.all。",
    {
      入参: { toolCallId, name, rawArgs: args },
      __code: `const gate = gatewayCheck(name);\nconst parsed = tool.schema.safeParse(args);\nconst result = await tool.handler(parsed.data);`,
    },
  );

  // ① Gateway 先过
  const gate = gatewayCheck(name);
  if (!gate.allowed) {
    logger.warn(
      "│ 工具执行-executeTool",
      "调用函数结束：executeTool（gateway 拒绝）",
      "为什么写这条日志：未注册工具或 dangerous 工具被拦；回灌 tool_result 时返回 ok:false 让模型能自纠。",
      {
        返回值: { ok: false, tool: name, tool_call_id: toolCallId, error: gate.reason ?? "gateway rejected" },
        reason: gate.reason,
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return { ok: false, tool: name, tool_call_id: toolCallId, error: gate.reason ?? "gateway rejected" };
  }

  // ② Zod 校验参数（防模型解析错 / 注入）
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

  // ③ 真正执行（async handler —— Promise.all 才有意义的关键）
  try {
    // @ts-ignore
    const result = await tool.handler(parsed.data);
    logger.info(
      "│ 工具执行-executeTool",
      "调用函数结束：executeTool",
      "为什么写这条日志：工具实际跑通；只写 result 摘要。",
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
      "为什么写这条日志：handler 内部抛异常；回灌 tool_result 时按失败处理，不让外层断片。",
      {
        返回值: { ok: false, tool: name, tool_call_id: toolCallId, error: err instanceof Error ? err.message : String(err) },
        耗时ms: Date.now() - tFuncStart,
        错误: err,
      },
    );
    return { ok: false, tool: name, tool_call_id: toolCallId, error: err instanceof Error ? err.message : String(err) };
  }
}

// 大对象 / 字符串截断，避免日志太长
function summarize(v: unknown): unknown {
  try {
    const s = JSON.stringify(v);
    if (s.length <= 200) return v;
    return JSON.parse(s.slice(0, 200) + "…");
  } catch {
    return String(v).slice(0, 200);
  }
}

// ── 给前端"Registry 面板"用：列出所有 Tool 的元信息 ──
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
    "为什么写这条日志：debug 是「细节」等级；前端 Tool Registry 面板拉一次是高频路径，命中 ok 时不写 info 免刷屏。",
    {
      返回值: { count: meta.length, tools: meta },
      耗时ms: Date.now() - t0,
    },
  );
  return meta;
}

// ── 给前端"已决定调哪几个 Tool"用：固定的旅游规划 tool_calls ──
// step-3 是 mock demo，没有真 LLM，所以这里硬编码 3 个 tool_call
// （对应 MD 需求 1：模型一次响应返回 3 个 tool_call）。
export type MockToolCall = { id: string; name: string; arguments: Record<string, unknown> };

export function planToolCalls(scenario: string): MockToolCall[] {
  const t0 = Date.now();
  logger.info(
    "│ mock 计划-planToolCalls",
    "调用函数开始：planToolCalls",
    "为什么写这条日志：route 只认这一层返回的 MockToolCall[]；step-3 是 mock demo 没有真 LLM，硬编码 3 个 tool_call。",
    {
      入参: { scenario },
      __code: `if (scenario === "tokyo-may-7days") return [...];\nreturn [];`,
    },
  );
  if (scenario === "tokyo-may-7days") {
    const calls: MockToolCall[] = [
      { id: "call_1", name: "search_flight", arguments: { to: "东京", month: 5 } },
      { id: "call_2", name: "get_weather", arguments: { city: "东京", month: 5 } },
      { id: "call_3", name: "get_packing_list", arguments: { season: "spring" } },
    ];
    logger.info(
      "│ mock 计划-planToolCalls",
      "调用函数结束：planToolCalls",
      "为什么写这条日志：route 要把 MockToolCall[] 写进 ctx.body 交给页面 stats 区；记 count + tool 名字便于核对。",
      {
        返回值: { count: calls.length, names: calls.map((c) => c.name) },
        耗时ms: Date.now() - t0,
      },
    );
    return calls;
  }
  logger.info(
    "│ mock 计划-planToolCalls",
    "调用函数结束：planToolCalls（空）",
    "为什么写这条日志：scenario 不在白名单时返回空数组；route 后续会按 400 处理。",
    {
      返回值: { count: 0, calls: [] },
      耗时ms: Date.now() - t0,
    },
  );
  return [];
}