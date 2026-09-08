/**
 * 职责：Tool Registry —— 2 个 Tool（get_weather + suggest_items）+ 统一执行入口 + Gateway 校验 + 模型决策 mock（decideHybridAction + classifyQuery）。
 * 数据流：tool_call { name, arguments } → gatewayCheck → schema safeParse → handler → ToolResult。
 *
 * step-7 vs step-5：本 Registry **多了**：
 *   - classifyQuery：根据 query 关键词判定走哪条路径（路径 A 仅 weather / 路径 B weather+硬接 suggest / 路径 C 直接打包被拒→退回）
 *   - decideHybridAction：模拟真实 LLM 在 while 循环里的决策，看 query 路径 + lastResult 决定下一步
 *
 * 日志（§5.3.16）：executeTool 是核心档——函数体逐步打满五件套（含 __code + 字段释义）；
 *   gatewayCheck / getToolsMeta / classifyQuery / decideHybridAction / checkChainConstraint / shouldHardcodeSuggestItems 是工具档——五件套（含 __code）仍要。
 */
import { getWeatherTool } from "./hybrid-get-weather.js";
import { suggestItemsTool } from "./hybrid-suggest-items.js";
import { logger } from "../logger.js";

// ── 注册表 ──
const TOOLS = {
  [getWeatherTool.name]: getWeatherTool,
  [suggestItemsTool.name]: suggestItemsTool,
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
export async function executeTool(
  name: string,
  args: unknown,
  toolCallId: string,
): Promise<ExecResult> {
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
      "为什么打：工具名合法但参数 schema 不匹配；记 issues 便于排错。",
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
    // @ts-ignore
    const result = await tool.handler(parsed.data);
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

// ── 给前端"Registry 面板"用 ──
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

export type HybridPath = "weather-only" | "umbrella" | "packing-direct";

export function classifyQuery(originalQuery: string): HybridPath {
  const t0 = Date.now();
  const hasUmbrella = /(带.*伞|下雨|雨季|打包清单|带什么|打包建议|行李)/.test(originalQuery);
  const hasWeather = /(天气|温度|平均|气候|几度|气温)/.test(originalQuery);
  let path: HybridPath;
  if (hasUmbrella) path = "umbrella";
  else if (hasWeather) path = "weather-only";
  else path = "packing-direct";
  logger.info(
    "│ 分类-classifyQuery",
    "调用函数结束：classifyQuery",
    "为什么打：route 要把路径写进 ctx.body 交给页面 stats 区；前端页会显示对应徽标。",
    {
      返回值: { path, hasUmbrella, hasWeather },
      originalQuery,
      耗时ms: Date.now() - t0,
      字段释义: {
        path: "路径 A 仅 weather / 路径 B weather+硬接 suggest / 路径 C 直接打包被拒→退回",
      },
    },
  );
  return path;
}

export type HybridDecision =
  | { kind: "tool_call"; tool: string; arguments: Record<string, unknown>; tool_call_id: string }
  | { kind: "final"; content: string };

export function decideHybridAction(
  round: number,
  originalQuery: string,
  path: HybridPath,
  lastResult: ExecResult | null,
  weatherCalled: boolean,
  suggestItemsCalled: boolean,
): HybridDecision {
  const t0 = Date.now();
  logger.info(
    "│ mock 决策-decideHybridAction",
    "调用函数开始：decideHybridAction",
    "为什么打：route 只认这一层返回的 HybridDecision；每轮路由层调用它决定下一步。",
    {
      入参: { round, path, weatherCalled, suggestItemsCalled, hasLastResult: Boolean(lastResult) },
      __code: `// path+round+state → HybridDecision`,
    },
  );

  let decision: HybridDecision;

  // ── 路径 A · weather-only ──
  if (path === "weather-only") {
    if (round === 1) {
      decision = {
        kind: "tool_call",
        tool: "get_weather",
        arguments: { city: "东京", month: 5 },
        tool_call_id: `call_A1`,
      };
    } else if (lastResult?.ok && lastResult.tool === "get_weather") {
      const c = lastResult.result as { city: string; month: number; avg_temp: number; rain_prob: number };
      decision = {
        kind: "final",
        content: `${c.city} ${c.month} 月平均气温 ${c.avg_temp}°C，雨季概率 ${c.rain_prob}。`,
      };
    } else {
      decision = { kind: "final", content: "(路径 A 兜底 final)" };
    }
  } else if (path === "umbrella") {
    if (round === 1) {
      decision = {
        kind: "tool_call",
        tool: "get_weather",
        arguments: { city: "东京", month: 5 },
        tool_call_id: `call_B1`,
      };
    } else if (lastResult?.ok && lastResult.tool === "get_weather") {
      // 仅类型断言（路径 B 路由层会硬接 suggest_items 后再让模型综合，所以这里不读字段）
      void (lastResult.result as { city: string; month: number; avg_temp: number; rain_prob: number });
      decision = {
        kind: "final",
        content: `(临时 final · 路由层硬接 suggest_items 后会再次让我综合 → 见 Round 3)`,
      };
    } else if (lastResult?.ok && lastResult.tool === "suggest_items") {
      const s = lastResult.result as { summary: string };
      decision = {
        kind: "final",
        content: `${s.summary}（综合天气 + 打包建议）`,
      };
    } else {
      decision = { kind: "final", content: "(路径 B 兜底 final)" };
    }
  } else {
    // path === "packing-direct"
    if (round === 1) {
      decision = {
        kind: "tool_call",
        tool: "suggest_items",
        arguments: { items: ["umbrella", "jacket"], rain_prob: undefined },
        tool_call_id: `call_C1`,
      };
    } else if (lastResult && !lastResult.ok && lastResult.error?.includes("请先调 get_weather")) {
      decision = {
        kind: "tool_call",
        tool: "get_weather",
        arguments: { city: "东京", month: 5 },
        tool_call_id: `call_C2`,
      };
    } else if (lastResult?.ok && lastResult.tool === "get_weather") {
      const c = lastResult.result as { rain_prob: number };
      decision = {
        kind: "tool_call",
        tool: "suggest_items",
        arguments: { items: ["umbrella", "jacket"], rain_prob: c.rain_prob },
        tool_call_id: `call_C3`,
      };
    } else if (lastResult?.ok && lastResult.tool === "suggest_items") {
      const s = lastResult.result as { summary: string };
      decision = {
        kind: "final",
        content: `${s.summary}（被路由层拒绝一次后退回 weather → suggest 完成）`,
      };
    } else {
      decision = { kind: "final", content: "(路径 C 兜底 final)" };
    }
  }

  logger.info(
    "│ mock 决策-decideHybridAction",
    "调用函数结束：decideHybridAction",
    "为什么打：route 要把 HybridDecision 用于推进循环；记 decision.kind + tool 便于核对。",
    {
      返回值: { decision: { kind: decision.kind, tool: decision.kind === "tool_call" ? decision.tool : undefined, arguments: decision.kind === "tool_call" ? decision.arguments : undefined } },
      耗时ms: Date.now() - t0,
    },
  );
  return decision;
}

// ── 路由层 hard-code 约束工具函数 ──
// 拒绝越权调用：suggest_items 在 get_weather 之前不能调
export function checkChainConstraint(
  decisionTool: string,
  weatherCalled: boolean,
): { allowed: boolean; reason?: string } {
  const t0 = Date.now();
  if (decisionTool === "suggest_items" && !weatherCalled) {
    const reason = "路由层 hard-code 约束：suggest_items 必须在 get_weather 之后调（rain_prob 必须来自上游 tool_result）；请先调 get_weather";
    logger.warn(
    "│ 约束-checkChainConstraint",
    "调用函数结束：checkChainConstraint",
    "为什么打：路由层硬约束违反：先 weather 后 suggest_items；让模型看到 error 强制回到 weather。warn 是「业务失败但能走通」的等级。",
    {
      返回值: { allowed: false, reason },
      decisionTool,
      weatherCalled,
      耗时ms: Date.now() - t0,
    },
  );
    return { allowed: false, reason };
  }
  logger.debug(
    "│ 约束-checkChainConstraint",
    "调用函数结束：checkChainConstraint",
    "为什么打：debug 是「细节」等级；约束命中 ok 时不打 info 免刷屏。",
    {
      返回值: { allowed: true },
      decisionTool,
      weatherCalled,
      耗时ms: Date.now() - t0,
    },
  );
  return { allowed: true };
}

// ── 路径 B 硬接：用户问"带不带伞" 时模型调完 weather → final → 路由层自动再调 suggest_items ──
export function shouldHardcodeSuggestItems(
  path: HybridPath,
  weatherCalled: boolean,
  suggestItemsCalled: boolean,
): boolean {
  const t0 = Date.now();
  const result = path === "umbrella" && weatherCalled && !suggestItemsCalled;
  logger.debug(
    "│ 硬接-shouldHardcodeSuggestItems",
    "调用函数结束：shouldHardcodeSuggestItems",
    "为什么打：debug 是「细节」等级；判定当前是否触发路径 B 硬接。",
    {
      返回值: { shouldHardcode: result },
      path,
      weatherCalled,
      suggestItemsCalled,
      耗时ms: Date.now() - t0,
    },
  );
  return result;
}