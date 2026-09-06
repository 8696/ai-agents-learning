/**
 * 职责：Tool Registry —— 2 个 Tool（get_weather + suggest_items）+ 统一执行入口 + Gateway 校验 + 模型决策 mock（decideHybridAction + classifyQuery）。
 * 数据流：tool_call { name, arguments } → gatewayCheck → schema safeParse → handler → ToolResult。
 *
 * step-7 vs step-5：本 Registry **多了**：
 *   - classifyQuery：根据 query 关键词判定走哪条路径（路径 A 仅 weather / 路径 B weather+硬接 suggest / 路径 C 直接打包被拒→退回）
 *   - decideHybridAction：模拟真实 LLM 在 while 循环里的决策，看 query 路径 + lastResult 决定下一步
 *
 * 教学锚点（覆盖 MD 易混点"三种编排方式对比 · 混合编排"）：
 *   - 路由层 hard-code 约束 1（拒绝越权调用）：suggest_items 必须在 get_weather 之后调，否则模型拿 ok:false error 反馈强制回到 weather（路径 C 演示）
 *   - 路由层 hard-code 约束 2（路径 B 硬接）：用户问"带不带伞" → 模型调 get_weather → 模型 final → 路由层自动再调 suggest_items
 *   - 模型自决要不要进两步链：路径 A 仅调 weather；路径 B weather → 硬接 suggest；路径 C 先被打回 weather → 再 suggest
 *
 * 日志（§5.3.16）：gateway.rejected / zod.fail / execute.ok / execute.fail / decide.next-action / classify.query 都打。
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
    logger.warn("registry.gateway.rejected", "未注册工具", "LLM 想调的工具不在白名单", { name, reason });
    return { allowed: false, reason };
  }
  if (tool.dangerous) {
    const reason = `dangerous tool ${name} requires manual approval`;
    logger.warn("registry.gateway.rejected", "危险工具", "工具被标 dangerous", { name, reason });
    return { allowed: false, reason };
  }
  logger.debug("registry.gateway.allowed", "gateway 放行", "工具通过 gateway 校验", { name });
  return { allowed: true };
}

// ── 统一执行入口 ──
export async function executeTool(
  name: string,
  args: unknown,
  toolCallId: string,
): Promise<ExecResult> {
  // ① Gateway 先过
  const gate = gatewayCheck(name);
  if (!gate.allowed) {
    return { ok: false, tool: name, tool_call_id: toolCallId, error: gate.reason ?? "gateway rejected" };
  }

  // ② Zod 校验参数
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

  // ③ 真正执行（async handler）
  try {
    // @ts-ignore
    const result = await tool.handler(parsed.data);
    logger.info("registry.execute.ok", "执行成功", "工具实际跑通", { name, toolCallId, resultPreview: summarize(result) });
    return { ok: true, tool: name, tool_call_id: toolCallId, result };
  } catch (err: unknown) {
    logger.error("registry.execute.fail", "执行抛错", "handler 内部抛异常", { name, toolCallId, err: err instanceof Error ? err.message : String(err) });
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
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    dangerous: t.dangerous,
  }));
}

// ───────────────────────────────────────────────────────────────────
// step-7 核心：路径分类 + 模型决策 mock（混合编排的"模型自决"侧）
//
// 真实 Agent 里 decideHybridAction 是 LLM 调用：`llm.chat({ messages, tools })` → 拿 assistantMsg.tool_calls / null
// step-7 用纯函数模拟，让 demo 确定性可复现（不依赖真实模型行为）。
//
// 路径分类规则（教学演示用）：
//   路径 A · weather-only：query 含"天气/温度/平均"但不涉打包 → 模型只调 get_weather，不进 suggest_items 链
//   路径 B · umbrella：query 含"带伞/雨/打包/带什么" → 模型调 get_weather，路由层硬接 suggest_items
//   路径 C · packing-direct：query 仅"打包/清单"无天气 → mock LLM 想直接调 suggest_items，路由层拒绝 → 强制回到 weather
//
// 决策矩阵（按 round + path + lastResult）：
//   路径 A round 1：tool_call get_weather
//   路径 A round 2：weather ok → final（路由层不硬接，因为 state.suggestItemsCalled 不需要）
//   路径 B round 1：tool_call get_weather
//   路径 B round 2：weather ok → final（**路由层硬接 suggest_items 后**再走模型 final）
//   路径 C round 1：tool_call suggest_items(items=["umbrella"], rain_prob=undefined) → 路由层拒绝 → 模型看 error
//   路径 C round 2：lastResult.error 含"必须先调 get_weather" → tool_call get_weather
//   路径 C round 3：weather ok → tool_call suggest_items(rain_prob=lastResult.result.rain_prob)
//   路径 C round 4：suggest_items ok → final
// ───────────────────────────────────────────────────────────────────

export type HybridPath = "weather-only" | "umbrella" | "packing-direct";

export function classifyQuery(originalQuery: string): HybridPath {
  const hasUmbrella = /(带.*伞|下雨|雨季|打包清单|带什么|打包建议|行李)/.test(originalQuery);
  const hasWeather = /(天气|温度|平均|气候|几度|气温)/.test(originalQuery);
  let path: HybridPath;
  if (hasUmbrella) path = "umbrella";
  else if (hasWeather) path = "weather-only";
  else path = "packing-direct";
  logger.info("classify.query", "query 路径分类", "根据关键词判定走哪条教学路径；前端页会显示对应徽标", {
    originalQuery, hasUmbrella, hasWeather, path,
  });
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
  // ── 路径 A · weather-only ──
  if (path === "weather-only") {
    if (round === 1) {
      logger.info("decide.next-action", "路径 A · Round 1 调 get_weather", "模型决定查天气；不调 suggest_items（用户没问打包）", { originalQuery });
      return {
        kind: "tool_call",
        tool: "get_weather",
        arguments: { city: "东京", month: 5 },
        tool_call_id: `call_A1`,
      };
    }
    if (lastResult?.ok && lastResult.tool === "get_weather") {
      const c = lastResult.result as { city: string; month: number; avg_temp: number; rain_prob: number };
      logger.info("decide.next-action", "路径 A · Round 2 final", "模型拿到 weather → 不进 suggest_items 链（用户没问打包） → 直接 final", { round });
      return {
        kind: "final",
        content: `${c.city} ${c.month} 月平均气温 ${c.avg_temp}°C，雨季概率 ${c.rain_prob}。`,
      };
    }
  }

  // ── 路径 B · umbrella ──
  if (path === "umbrella") {
    if (round === 1) {
      logger.info("decide.next-action", "路径 B · Round 1 调 get_weather", "模型决定先查天气（路由层会自动硬接 suggest_items）", { originalQuery });
      return {
        kind: "tool_call",
        tool: "get_weather",
        arguments: { city: "东京", month: 5 },
        tool_call_id: `call_B1`,
      };
    }
    if (lastResult?.ok && lastResult.tool === "get_weather") {
      // 模型决定 final，但路由层会硬接 suggest_items（在 routes/hybrid.ts 处理）
      const c = lastResult.result as { city: string; month: number; avg_temp: number; rain_prob: number };
      logger.info("decide.next-action", "路径 B · Round 2 final（路由层将硬接 suggest_items）", "模型决定不再调 → final；路由层随后自动跑 suggest_items", { round, rain_prob: c.rain_prob });
      return {
        kind: "final",
        content: `(临时 final · 路由层硬接 suggest_items 后会再次让我综合 → 见 Round 3)`,
      };
    }
    if (lastResult?.ok && lastResult.tool === "suggest_items") {
      // 路由层硬接 suggest_items 已跑完 → 模型综合 final
      const s = lastResult.result as { summary: string };
      logger.info("decide.next-action", "路径 B · Round 3 综合 final", "模型拿到 suggest_items 结果 → 综合 final", { round });
      return {
        kind: "final",
        content: `${s.summary}（综合天气 + 打包建议）`,
      };
    }
  }

  // ── 路径 C · packing-direct（演示路由层拒绝越权调用）──
  if (path === "packing-direct") {
    if (round === 1) {
      // mock LLM 故意跳过 weather 直接调 suggest_items（rain_prob 暂时 undefined —— 会被 Zod 拦下前先被路由层拦下）
      logger.info("decide.next-action", "路径 C · Round 1 直接 suggest_items（rain_prob=undefined）", "mock LLM 跳过 weather → 路由层 hard-code 会拒绝；演示硬约束", { originalQuery });
      return {
        kind: "tool_call",
        tool: "suggest_items",
        arguments: { items: ["umbrella", "jacket"], rain_prob: undefined },
        tool_call_id: `call_C1`,
      };
    }
    if (lastResult && !lastResult.ok && lastResult.error?.includes("请先调 get_weather")) {
      // 上一轮被路由层拒绝 → 模型看 error 决定先调 weather
      logger.info("decide.next-action", "路径 C · Round 2 退回 get_weather", "模型看到路由层拒绝 error → 决定先调 get_weather", { round });
      return {
        kind: "tool_call",
        tool: "get_weather",
        arguments: { city: "东京", month: 5 },
        tool_call_id: `call_C2`,
      };
    }
    if (lastResult?.ok && lastResult.tool === "get_weather") {
      // weather 完成 → 调 suggest_items（用 rain_prob）
      const c = lastResult.result as { rain_prob: number };
      logger.info("decide.next-action", "路径 C · Round 3 调 suggest_items", "weather 已跑 → 用 rain_prob 派生 suggest_items", { rain_prob: c.rain_prob, round });
      return {
        kind: "tool_call",
        tool: "suggest_items",
        arguments: { items: ["umbrella", "jacket"], rain_prob: c.rain_prob },
        tool_call_id: `call_C3`,
      };
    }
    if (lastResult?.ok && lastResult.tool === "suggest_items") {
      const s = lastResult.result as { summary: string };
      logger.info("decide.next-action", "路径 C · Round 4 final", "suggest_items 完成 → 模型综合 final", { round });
      return {
        kind: "final",
        content: `${s.summary}（被路由层拒绝一次后退回 weather → suggest 完成）`,
      };
    }
  }

  // 兜底
  return { kind: "final", content: "(未匹配路径分支)" };
}

// ── 路由层 hard-code 约束工具函数 ──
// 拒绝越权调用：suggest_items 在 get_weather 之前不能调
export function checkChainConstraint(
  decisionTool: string,
  weatherCalled: boolean,
): { allowed: boolean; reason?: string } {
  if (decisionTool === "suggest_items" && !weatherCalled) {
    const reason = "路由层 hard-code 约束：suggest_items 必须在 get_weather 之后调（rain_prob 必须来自上游 tool_result）；请先调 get_weather";
    logger.warn("router.chain.rejected", "拒绝越权调用 suggest_items", "路由层硬约束违反：先 weather 后 suggest_items；让模型看到 error 强制回到 weather", { decisionTool, weatherCalled, reason });
    return { allowed: false, reason };
  }
  return { allowed: true };
}

// ── 路径 B 硬接：用户问"带不带伞" 时模型调完 weather → final → 路由层自动再调 suggest_items ──
export function shouldHardcodeSuggestItems(
  path: HybridPath,
  weatherCalled: boolean,
  suggestItemsCalled: boolean,
): boolean {
  return path === "umbrella" && weatherCalled && !suggestItemsCalled;
}