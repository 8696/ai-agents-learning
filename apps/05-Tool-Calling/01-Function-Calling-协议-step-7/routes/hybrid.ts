/**
 * 职责：POST /api/hybrid —— 混合编排场景（对应 pages/hybrid.html）。
 * 数据流：
 *   POST { query } →
 *     path = classifyQuery(query)                          ← 教学路径分类（前端徽标显示）
 *     while (rounds < MAX) {
 *       ① decision = decideHybridAction(round, query, path, lastResult, weatherCalled, suggestItemsCalled)
 *       ② if decision.tool === "suggest_items" && !weatherCalled → 路由层拒绝（拒绝越权）
 *       ③ if decision.kind === "final" && shouldHardcodeSuggestItems → 路由层自动跑 suggest_items
 *       ④ if decision.kind === "tool_call" → executeTool() → 推进 state
 *     }
 *     返 { path, trace, finalReply, totalMs, rounds, maxRoundsTriggered }
 *
 * step-7 vs step-5：step-5 routes/self-correct.ts 只跑 while + 模型决策；
 *   step-7 加**两条路由层 hard-code 约束**：
 *     ① 拒绝越权：suggest_items 必须在 get_weather 之后调（checkChainConstraint）
 *     ② 路径 B 硬接：用户问"带不带伞" → 模型调 weather → final → 路由层**自动**再调 suggest_items（用 weather.rain_prob）
 *
 * 教学锚点（覆盖 MD 易混点"三种编排方式对比 · 混合编排"）：
 *   - 路径 A（仅 weather）：用户问"5 月东京平均气温" → 模型调 weather → final（不调 suggest）
 *   - 路径 B（weather + 路由硬接 suggest）：用户问"5 月东京带不带伞" → weather → 模型 final → 路由层硬接 suggest → final
 *   - 路径 C（直接打包被拒→退回）：用户问"打包清单" → mock LLM 直接 suggest → 路由层拒绝 → weather → suggest → final
 *
 * 日志（§5.3.16）：hybrid.received / loop.start / loop.iteration / loop.hardcode-suggest / loop.done / loop.sent / chain.rejected / path.classify 都打。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import {
  executeTool,
  getToolsMeta,
  classifyQuery,
  decideHybridAction,
  checkChainConstraint,
  shouldHardcodeSuggestItems,
  type ExecResult,
  type HybridPath,
} from "../lib/tools/registry.js";
import { logger } from "../lib/logger.js";

const MAX_ROUNDS = 8;  // 给路径 C（4 轮）+ 路径 B（3 轮）留余量

type RoundTrace = {
  round: number;
  decisionKind: "tool_call" | "final";
  decisionTool?: string;
  decisionArgs?: Record<string, unknown>;
  rejectedByRouter?: { reason: string };
  hardcodedByRouter?: boolean;
  result?: ExecResult;
  startMs: number;     // 相对 loop 开始
  endMs: number;
  durationMs: number;
};

export function mountHybridRoutes(router: Router): void {
  router.get("/api/tools", (ctx: Context) => {
    const meta = getToolsMeta();
    logger.info("tools.list", "GET /api/tools", "前端拉工具列表", { count: meta.length });
    ctx.body = { tools: meta };
  });

  router.post("/api/hybrid", async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as { query?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";

    logger.info("hybrid.received", "POST /api/hybrid", "前端发来混合编排请求；记 query", { query });

    if (!query) {
      logger.warn("hybrid.bad-input", "query 空", "query 不能为空", { body });
      ctx.status = 400;
      ctx.body = { error: "query 不能为空" };
      return;
    }

    // ── ① 路径分类 ──
    const path: HybridPath = classifyQuery(query);

    const loopStart = Date.now();
    const trace: RoundTrace[] = [];
    let finalReply: string | null = null;
    let maxRoundsTriggered = false;
    let rounds = 0;
    let weatherCalled = false;
    let suggestItemsCalled = false;
    let lastResult: ExecResult | null = null;

    logger.info("loop.start", "进入 while 循环", "MAX_ROUNDS=" + MAX_ROUNDS + "；路由层 hard-code 两条约束（拒绝越权 + 路径 B 硬接）；每轮由 decideHybridAction 决定", {
      maxRounds: MAX_ROUNDS, path,
    });

    while (rounds < MAX_ROUNDS) {
      rounds++;
      const decision = decideHybridAction(rounds, query, path, lastResult, weatherCalled, suggestItemsCalled);

      // ── 终止条件 1：模型决定 final ──
      if (decision.kind === "final") {
        logger.info("loop.iteration", `Round ${rounds} 决定 final`, "模型看完 tool_result 决定不再调", { round: rounds });
        const startMs = Date.now() - loopStart;

        // ── 路由层 hard-code 约束 2：路径 B 硬接 suggest_items ──
        if (shouldHardcodeSuggestItems(path, weatherCalled, suggestItemsCalled)) {
          // 用 lastResult（weather.result）派生 suggest_items 参数
          const weatherData = (lastResult && lastResult.ok && lastResult.tool === "get_weather")
            ? (lastResult.result as { rain_prob: number; city: string; month: number })
            : null;
          if (weatherData) {
            logger.warn("loop.hardcode-suggest", "路径 B 硬接 suggest_items", "路由层 hard-code：用户问带不带伞，模型调 weather 后决定 final → 路由层自动跑 suggest_items（用 weather.rain_prob）", {
              rain_prob: weatherData.rain_prob,
              path,
            });
            const suggestArgs = { items: ["umbrella", "jacket"], rain_prob: weatherData.rain_prob };
            const suggestCallId = `call_B2_hardcoded`;
            const r: ExecResult = await executeTool("suggest_items", suggestArgs, suggestCallId);
            const endMs = Date.now() - loopStart;
            trace.push({
              round: rounds,
              decisionKind: "tool_call",
              decisionTool: "suggest_items",
              decisionArgs: suggestArgs,
              hardcodedByRouter: true,
              result: r,
              startMs: 0,
              endMs,
              durationMs: endMs,
            });
            suggestItemsCalled = true;
            lastResult = r;
            // 推进轮数 + 模型综合 final（路径 B Round 3）
            rounds++;
            const finalDecision = decideHybridAction(rounds, query, path, lastResult, weatherCalled, suggestItemsCalled);
            if (finalDecision.kind === "final") {
              finalReply = finalDecision.content;
              logger.info("loop.iteration", `Round ${rounds} 综合 final（路由层硬接后）`, "模型拿到 suggest_items 结果 → 综合 final", { round: rounds });
            }
            break;
          }
        }

        finalReply = decision.content;
        const endMs = Date.now() - loopStart;
        trace.push({
          round: rounds,
          decisionKind: "final",
          startMs,
          endMs,
          durationMs: endMs - startMs,
        });
        break;
      }

      // ── 路由层 hard-code 约束 1：拒绝越权调用 ──
      const constraint = checkChainConstraint(decision.tool, weatherCalled);
      const startMs = Date.now() - loopStart;
      if (!constraint.allowed) {
        // 把 error 当 tool_result 反馈给下一轮模型（类似 step-5 失败回灌模式）
        const errorResult: ExecResult = {
          ok: false,
          tool: decision.tool,
          tool_call_id: decision.tool_call_id,
          error: constraint.reason ?? "router rejected",
        };
        const endMs = Date.now() - loopStart;
        trace.push({
          round: rounds,
          decisionKind: "tool_call",
          decisionTool: decision.tool,
          decisionArgs: decision.arguments,
          rejectedByRouter: { reason: constraint.reason ?? "router rejected" },
          result: errorResult,
          startMs,
          endMs,
          durationMs: endMs - startMs,
        });
        lastResult = errorResult;
        continue;
      }

      // ── 执行 tool_call ──
      logger.info("loop.iteration", `Round ${rounds} 决定 tool_call`, "模型决定调工具", { round: rounds, tool: decision.tool, arguments: decision.arguments });
      const r: ExecResult = await executeTool(decision.tool, decision.arguments, decision.tool_call_id);
      const endMs = Date.now() - loopStart;
      trace.push({
        round: rounds,
        decisionKind: "tool_call",
        decisionTool: decision.tool,
        decisionArgs: decision.arguments,
        result: r,
        startMs,
        endMs,
        durationMs: endMs - startMs,
      });

      // 推进 state
      if (decision.tool === "get_weather") {
        weatherCalled = true;
      }
      if (decision.tool === "suggest_items") {
        suggestItemsCalled = true;
      }
      lastResult = r;
    }

    // ── 终止条件 2：MAX_ROUNDS 触发 ──
    if (finalReply === null && rounds >= MAX_ROUNDS) {
      maxRoundsTriggered = true;
      finalReply = `(MAX_ROUNDS=${MAX_ROUNDS} 触发；模型未收敛。业务降级：返 structured error 让上层重试或人工介入)`;
      logger.warn("loop.max-rounds", "MAX_ROUNDS 触发", "while 退出但未 final；业务降级", { maxRounds: MAX_ROUNDS, rounds });
    }

    const totalMs = Date.now() - loopStart;
    logger.info("loop.done", "循环结束", "记 totalMs + rounds + path + 路由层硬接 / 拒绝次数", {
      totalMs, rounds, path, maxRoundsTriggered,
      hardcodeCount: trace.filter((t) => t.hardcodedByRouter).length,
      rejectedCount: trace.filter((t) => t.rejectedByRouter).length,
    });

    ctx.body = {
      query,
      path,
      trace,
      totalMs,
      finalReply,
      rounds,
      maxRoundsTriggered,
      weatherCalled,
      suggestItemsCalled,
    };
    logger.info("loop.sent", "responded to client", "已返回", { status: 200 });
  });
}