/**
 * 职责：POST /api/agent/timeout-gate —— timeout 单闸（step-3 · mock）。
 * 数据流：query.timeoutMs + latencyMsPerStep → runLoop({ enableTimeoutGate: true, useRealLlm: false }) → ctx.body。
 * 为什么单独成文件：§5.3.8 一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { runLoop } from "../lib/flow/loop.js";
import { logger } from "../lib/logger.js";

const HARD_CAP = 200;

const query = z.object({
  timeoutMs: z.coerce.number().int().positive().max(60_000).default(300),
  latencyMsPerStep: z.coerce.number().int().nonnegative().max(2000).default(80),
});

export function mountTimeoutGateRoutes(router: Router): void {
  router.post("/api/agent/timeout-gate", async (ctx: Context, _next: Next) => {
    const parsed = query.safeParse(ctx.query);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join(".") || "param"}：${i.message}`).join("；");
      ctx.status = 400;
      ctx.body = { error: `输入有误：${issues}`, code: "INVALID_INPUT" };
      return;
    }
    const { timeoutMs, latencyMsPerStep } = parsed.data;
    const t0 = Date.now();
    logger.info("路由-timeout", "调用函数开始：POST /api/agent/timeout-gate", "演示 timeout 单闸；mock 模型 + 每轮 sleep。当前：timeoutMs=" + timeoutMs, { 入参: { timeoutMs, latencyMsPerStep }, __code: "await runLoop(...)" });
    const out = await runLoop({
      enableMaxStepsGate: false,
      maxSteps: 0,
      enableTimeoutGate: true,
      timeoutMs,
      enableModelStopGate: false,
      useRealLlm: false,
      query: "",
      mockStopAt: 0,
      latencyMsPerStep,
      hardCap: HARD_CAP,
      label: `timeout 单闸（timeout = ${timeoutMs}ms）`,
    });
    ctx.body = out;
    logger.info("路由-timeout", "调用函数结束：POST /api/agent/timeout-gate", "收口", { 返回值: { stepCount: out.stepCount, stoppedReason: out.stoppedReason, elapsedMs: out.summary.elapsedMs }, 耗时ms: Date.now() - t0 });
  });
}