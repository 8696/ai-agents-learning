/**
 * 职责：POST /api/self-correct —— 模型自编排链场景（对应 pages/self-correct.html）。
 * 数据流：
 *   POST { query } →
 *     while (rounds < MAX) {
 *       ① 决策：decideNextAction(round, query, lastResult) → 模拟 LLM 看 tool_result 决定下一步
 *       ② 如果 kind === "final" → 退出循环，返 final content
 *       ③ 如果 kind === "tool_call" → executeTool() → 记 stepTrace
 *       ④ lastResult = 当前轮结果 → 下一轮模型看到
 *     }
 *     返 { query, trace: [{round, decision, result, startMs, endMs}, ...], totalMs, finalReply, maxRoundsTriggered }
 *
 * step-5 vs step-4：step-4 路由层 hard-code A → B（2 步固定）；step-5 是 while 循环 + 模型决策。
 *   - 每轮由 decideNextAction mock 函数决定（实际生产 = LLM 调 llm.chat({messages, tools})）
 *   - 自纠：search_doc 返空 hits → 模型换 query → 重试
 *   - MAX_ROUNDS 边界：防止模型无限调
 *
 * 与 routes/chain.ts (step-4) 的关系：本路由服务"自纠"场景（pages/self-correct.html）；
 *   step-4 的 chain 是路由层 hard-code 链 A → B；step-5 是 while 循环 + 模型决策。
 *   **页与接口 1:1**（§5.3.8）。
 *
 * 教学锚点（覆盖 MD 例子 5.5 + 错误恢复闭环）：
 *   - while + finish_reason 循环骨架
 *   - 模型自纠：空 tool_result → 换 query → 重试（看 trace[1] 怎么触发 trace[2]）
 *   - MAX_ROUNDS 边界：超 4 轮未收敛 → final 报 MAX_REACHED
 *
 * 日志（§5.3.16）：self-correct.received / loop.start / loop.iteration / loop.done / loop.sent 都打。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import {
  executeTool,
  getToolsMeta,
  decideNextAction,
  type Decision,
  type ExecResult,
} from "../lib/tools/registry.js";
import { logger } from "../lib/logger.js";

const MAX_ROUNDS = 4;  // 防止模型无限调

type RoundTrace = {
  round: number;
  decision: Decision;
  result: ExecResult;
  startMs: number;     // 相对 loop 开始的 ms
  endMs: number;
  durationMs: number;
};

// ── 路由 ──
export function mountSelfCorrectRoutes(router: Router): void {
  router.get("/api/tools", (ctx: Context) => {
    const meta = getToolsMeta();
    logger.info("tools.list", "GET /api/tools", "前端拉工具列表", { count: meta.length });
    ctx.body = { tools: meta };
  });

  router.post("/api/self-correct", async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as { query?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";

    logger.info("self-correct.received", "POST /api/self-correct", "前端发来自纠请求", { query });

    // §5.3.12 入参闸门
    if (!query) {
      logger.warn("self-correct.bad-input", "query 空", "query 不能为空", { body });
      ctx.status = 400;
      ctx.body = { error: "query 不能为空" };
      return;
    }

    const loopStart = Date.now();
    const trace: RoundTrace[] = [];
    let lastResult: ExecResult | null = null;
    let finalReply: string | null = null;
    let maxRoundsTriggered = false;
    let rounds = 0;

    logger.info("loop.start", "进入 while 循环", "MAX_ROUNDS=" + MAX_ROUNDS + "；每轮由 decideNextAction 决定下一步", { maxRounds: MAX_ROUNDS });

    while (rounds < MAX_ROUNDS) {
      rounds++;
      const decision = decideNextAction(rounds, query, lastResult);

      // ── 终止条件 1：模型决定"够了"（kind === "final"）──
      if (decision.kind === "final") {
        logger.info("loop.iteration", `Round ${rounds} 决定 final`, "模型看完 tool_result 决定不再调；退出循环", { round: rounds, finalPreview: decision.content.slice(0, 50) });
        finalReply = decision.content;
        break;
      }

      // ── 执行 tool_call ──
      const toolCallId = decision.tool_call_id;
      logger.info("loop.iteration", `Round ${rounds} 决定 tool_call`, "模型决定调工具", { round: rounds, tool: decision.tool, arguments: decision.arguments });
      const startMs = Date.now() - loopStart;
      const r: ExecResult = await executeTool(decision.tool, decision.arguments, toolCallId);
      const endMs = Date.now() - loopStart;
      trace.push({
        round: rounds,
        decision,
        result: r,
        startMs,
        endMs,
        durationMs: endMs - startMs,
      });
      lastResult = r;
    }

    // ── 终止条件 2：MAX_ROUNDS 触发（while 退出但 finalReply 仍 null）──
    if (finalReply === null && rounds >= MAX_ROUNDS) {
      maxRoundsTriggered = true;
      finalReply = `(MAX_ROUNDS=${MAX_ROUNDS} 触发；模型未收敛。业务降级：返 structured error 让上层重试或人工介入)`;
      logger.warn("loop.max-rounds", "MAX_ROUNDS 触发", "while 退出但未 final；业务降级", { maxRounds: MAX_ROUNDS, rounds });
    }

    const totalMs = Date.now() - loopStart;
    logger.info("loop.done", "循环结束", "记 totalMs + rounds + 是否触发 MAX_ROUNDS", { totalMs, rounds, maxRoundsTriggered });

    ctx.body = {
      query,
      trace,
      totalMs,
      finalReply,
      rounds,
      maxRoundsTriggered,
    };
    logger.info("loop.sent", "responded to client", "已返回", { status: 200 });
  });
}