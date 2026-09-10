/**
 * 职责：POST /api/agent/token-budget —— token budget 闸（变体 7）。
 * 数据流：mock 模型每轮调不同 sku；tokenEstimate 每轮累；超 budget → stoppedReason=token_budget。
 * 为什么单独成文件：§5.3.8 一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { runLoop } from "../lib/flow/loop.js";
import { logger } from "../lib/logger.js";

const HARD_CAP = 200;

const query = z.object({
  maxSteps: z.coerce.number().int().positive().max(1000).default(20),
  latencyMsPerStep: z.coerce.number().int().nonnegative().max(2000).default(50),
  tokenBudget: z.coerce.number().int().positive().max(1_000_000).default(500),
});

export function mountTokenBudgetRoutes(router: Router): void {
  router.post("/api/agent/token-budget", async (ctx: Context, _next: Next) => {
    const parsed = query.safeParse(ctx.query);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join(".") || "param"}：${i.message}`).join("；");
      ctx.status = 400;
      ctx.body = { error: `输入有误：${issues}`, code: "INVALID_INPUT" };
      return;
    }
    const { maxSteps, latencyMsPerStep, tokenBudget } = parsed.data;
    const t0 = Date.now();
    logger.info("路由-token-budget", "调用函数开始：POST /api/agent/token-budget", "演示 token budget 闸（变体 7）；mock 模型每轮调不同 sku（避免闸门 6 误触），token 累计到上限就停。当前：tokenBudget=" + tokenBudget, { 入参: { maxSteps, latencyMsPerStep, tokenBudget }, __code: "await runLoop({...})" });
    const out = await runLoop({
      enableMaxStepsGate: true,
      maxSteps,
      enableTimeoutGate: false,
      timeoutMs: 0,
      enableModelStopGate: false,
      enableUserCancelGate: false,
      enableToolRetryGate: false,
      enableToolCallLoopGate: false,
      loopDetectionWindow: 0,
      enableTokenBudgetGate: true,
      tokenBudget,
      useRealLlm: false,
      query: "",
      mockStopAt: 0,
      latencyMsPerStep,
      hardCap: HARD_CAP,
      label: `token budget 闸（预算=${tokenBudget}）`,
      abortSignal: null,
      toolMaxRetries: 0,
      flakyRate: 0,
      alwaysFail: false,
    });
    ctx.body = out;
    logger.info("路由-token-budget", "调用函数结束：POST /api/agent/token-budget", "收口；前端要把 stoppedReason + tokenEstimate + tokenBudget 亮出来。", { 返回值: { stepCount: out.stepCount, stoppedReason: out.stoppedReason, tokenEstimate: out.tokenEstimate, tokenBudget, elapsedMs: out.summary.elapsedMs }, 耗时ms: Date.now() - t0 });
  });
}