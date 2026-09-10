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
 * 日志（§5.3.16）：调用函数 五条日志（handlePostHybrid 封装层）；
 *   校验挡下单独写 warn；子调用 decideHybridAction / executeTool 内部已自带五条日志。
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

const MAX_ROUNDS = 8;

type RoundTrace = {
  round: number;
  decisionKind: "tool_call" | "final";
  decisionTool?: string;
  decisionArgs?: Record<string, unknown>;
  rejectedByRouter?: { reason: string };
  hardcodedByRouter?: boolean;
  result?: ExecResult;
  startMs: number;
  endMs: number;
  durationMs: number;
};

export function mountHybridRoutes(router: Router): void {
  router.get("/api/tools", (ctx: Context) => {
    const tHandlerStart = Date.now();
    const meta = getToolsMeta();
    logger.info(
      "api.tools",
      "调用函数开始：handleGetTools",
      "为什么写这条日志：route 只认这一层返回的 { tools }；里面 getToolsMeta 是真正干活的那一层。当前：前端 Tool Registry 面板拉一次；记 count 便于核对前后端 tool schema 是否一致。",
      {
        入参: { endpoint: "GET /api/tools" },
        __code: `ctx.body = { tools: getToolsMeta() };`,
      },
    );
    ctx.body = { tools: meta };
    logger.info(
      "api.tools",
      "调用函数结束：handleGetTools",
      "为什么写这条日志：route 要把 { tools } 写进 ctx.body 交给前端 Registry 面板。",
      {
        返回值: { count: meta.length },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
  });

  router.post("/api/hybrid", async (ctx: Context) => {
    const tHandlerStart = Date.now();
    const body = (ctx.request.body ?? {}) as { query?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";

    logger.info(
      "api.hybrid",
      "调用函数开始：handlePostHybrid",
      "为什么写这条日志：route 只认这一层返回的 trace + finalReply；里面 while + decideHybridAction + executeTool 是真正干活的那一层。当前：前端发来混合编排请求；记 query 便于核对。",
      {
        入参: { queryPreview: query.slice(0, 60), queryLen: query.length, bodyKeys: Object.keys(body) },
        __code: `// while 循环 + 路由层 hard-code 两条约束`,
      },
    );

    if (!query) {
      logger.warn(
        "api.hybrid",
        "调用函数结束：handlePostHybrid（校验拒绝）",
        "为什么写这条日志：query 不能为空；走 400 不让 while 浪费工具调用。",
        {
          返回值: { httpStatus: 400, error: "query 不能为空" },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
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

    logger.info(
      "││ loop-hybrid",
      "调用循环开始：while 循环骨架 + 路由层 hard-code 两条约束",
      "为什么写这条日志：MAX_ROUNDS=" + MAX_ROUNDS + "；每轮由 decideHybridAction 决定下一步；路由层会拒绝越权 + 硬接路径 B。",
      {
        maxRounds: MAX_ROUNDS,
        path,
      },
    );

    while (rounds < MAX_ROUNDS) {
      rounds++;
      const decision = decideHybridAction(rounds, query, path, lastResult, weatherCalled, suggestItemsCalled);

      // ── 终止条件 1：模型决定 final ──
      if (decision.kind === "final") {
        const startMs = Date.now() - loopStart;

        // ── 路由层 hard-code 约束 2：路径 B 硬接 suggest_items ──
        if (shouldHardcodeSuggestItems(path, weatherCalled, suggestItemsCalled)) {
          const weatherData = (lastResult && lastResult.ok && lastResult.tool === "get_weather")
            ? (lastResult.result as { rain_prob: number; city: string; month: number })
            : null;
          if (weatherData) {
            logger.warn(
              "││ loop-hybrid",
              "调用循环进行中：路径 B 硬接 suggest_items",
              "为什么写这条日志：路由层 hard-code：用户问带不带伞，模型调 weather 后决定 final → 路由层自动跑 suggest_items（用 weather.rain_prob）。",
              {
                中间状态: { rain_prob: weatherData.rain_prob, path },
              },
            );
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
            rounds++;
            const finalDecision = decideHybridAction(rounds, query, path, lastResult, weatherCalled, suggestItemsCalled);
            if (finalDecision.kind === "final") {
              finalReply = finalDecision.content;
              logger.info(
                "││ loop-hybrid",
                `调用循环 · 第 ${rounds} 轮 · 综合 final（路由层硬接后）`,
                "为什么写这条日志：模型拿到 suggest_items 结果 → 综合 final。",
                {
                  中间状态: { finalPreview: finalReply.slice(0, 50) },
                },
              );
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
        logger.info(
          "││ loop-hybrid",
          `调用循环结束：第 ${rounds} 轮（final）`,
          "为什么写这条日志：模型看完 tool_result 决定不再调；退出循环。",
          {
            第几轮: rounds,
            本轮结果: { finalPreview: finalReply.slice(0, 50) },
          },
        );
        break;
      }

      // ── 路由层 hard-code 约束 1：拒绝越权调用 ──
      const constraint = checkChainConstraint(decision.tool, weatherCalled);
      const startMs = Date.now() - loopStart;
      if (!constraint.allowed) {
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
        logger.info(
          "││ loop-hybrid",
          `调用循环 · 第 ${rounds} 轮 · 拒绝越权`,
          "为什么写这条日志：路由层拒绝越权调用 suggest_items；把 error 当 tool_result 反馈给下一轮模型（类似 step-5 失败回灌模式）。",
          {
            第几轮: rounds,
            本轮为什么是这些参数: { tool: decision.tool, reason: constraint.reason },
          },
        );
        continue;
      }

      // ── 执行 tool_call ──
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

      if (decision.tool === "get_weather") weatherCalled = true;
      if (decision.tool === "suggest_items") suggestItemsCalled = true;
      lastResult = r;
      logger.info(
        "││ loop-hybrid",
        `调用循环 · 第 ${rounds} 轮 · tool_call 子执行`,
        "为什么写这条日志：模型决定调工具；记 tool + ok 便于回看。",
        {
          第几轮: rounds,
          本轮结果: { tool: decision.tool, ok: r.ok, error: r.ok ? undefined : r.error },
        },
      );
    }

    if (finalReply === null && rounds >= MAX_ROUNDS) {
      maxRoundsTriggered = true;
      finalReply = `(MAX_ROUNDS=${MAX_ROUNDS} 触发；模型未收敛。业务降级：返 structured error 让上层重试或人工介入)`;
      logger.warn(
        "││ loop-hybrid",
        "调用循环结束：MAX_ROUNDS 触发",
        "为什么写这条日志：while 退出但未 final；业务降级；记 maxRounds + rounds 便于复盘。",
        {
          第几轮: rounds,
          本轮结果: { maxRounds: MAX_ROUNDS, maxRoundsTriggered: true },
        },
      );
    }

    const totalMs = Date.now() - loopStart;
    logger.info(
      "││ loop-hybrid",
      "调用循环结束：循环收尾",
      "为什么写这条日志：记 totalMs + rounds + path + 路由层硬接 / 拒绝次数 便于核对。",
      {
        本轮结果: {
          totalMs,
          rounds,
          path,
          maxRoundsTriggered,
          hardcodeCount: trace.filter((t) => t.hardcodedByRouter).length,
          rejectedCount: trace.filter((t) => t.rejectedByRouter).length,
        },
      },
    );
    logger.info(
      "api.hybrid",
      "调用函数结束：handlePostHybrid",
      "为什么写这条日志：route 要把响应包写进 ctx.body 交给页面 stats 区；含 path / trace / finalReply / totalMs / rounds。",
      {
        返回值: { status: 200, totalMs, rounds, path, traceCount: trace.length, finalLen: finalReply?.length ?? 0 },
        耗时ms: Date.now() - tHandlerStart,
      },
    );

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
  });
}