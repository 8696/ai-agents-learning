/**
 * 职责：POST /api/agent/dual-gate —— max + timeout 双闸叠加（step-2）。
 * 数据流：query.maxSteps + timeoutMs + latencyMsPerStep → runLoop({ enableMaxStepsGate: true, enableTimeoutGate: true }) → ctx.body。
 * 为什么单独成文件：§5.3.8 一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { runLoop } from "../lib/flow/loop.js";
import { logger } from "../lib/logger.js";

const HARD_CAP = 200;

const query = z.object({
  maxSteps: z.coerce.number().int().positive().max(1000).default(10),
  timeoutMs: z.coerce.number().int().positive().max(60_000).default(300),
  latencyMsPerStep: z.coerce.number().int().nonnegative().max(2000).default(80),
});

export function mountDualGateRoutes(router: Router): void {
  router.post("/api/agent/dual-gate", async (ctx: Context, _next: Next) => {
    const parsed = query.safeParse(ctx.query);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join(".") || "param"}：${i.message}`).join("；");
      logger.warn(
        "路由-双闸",
        "调用函数结束：POST /api/agent/dual-gate（输入校验失败）",
        "为什么写这条日志：第二类错误。当前：issues=" + issues,
        { 返回值: { issues, rawQuery: ctx.query }, 耗时ms: 0 },
      );
      ctx.status = 400;
      ctx.body = { error: `输入有误：${issues}`, code: "INVALID_INPUT" };
      return;
    }
    const { maxSteps, timeoutMs, latencyMsPerStep } = parsed.data;

    const t0 = Date.now();
    logger.info(
      "路由-双闸",
      "调用函数开始：POST /api/agent/dual-gate",
      "为什么写这条日志：演示「双闸叠加 · 谁先到谁说了算」。当前：maxSteps=" + maxSteps + " · timeoutMs=" + timeoutMs + " · latency=" + latencyMsPerStep + "ms",
      { 入参: { maxSteps, timeoutMs, latencyMsPerStep, hardCap: HARD_CAP }, __code: "const out = await runLoop({ enableMaxStepsGate: true, maxSteps, enableTimeoutGate: true, timeoutMs, latencyMsPerStep, hardCap, label: '双闸' });" },
    );
    const out = await runLoop({
      enableMaxStepsGate: true,
      maxSteps,
      enableTimeoutGate: true,
      timeoutMs,
      latencyMsPerStep,
      hardCap: HARD_CAP,
      label: `双闸（max steps=${maxSteps} · timeout=${timeoutMs}ms）`,
    });
    ctx.body = out;
    logger.info(
      "路由-双闸",
      "调用函数结束：POST /api/agent/dual-gate",
      "为什么写这条日志：收口；前端要把「实际触发的那道闸」与「另一道闸剩多少」亮出来。",
      { 返回值: { label: out.label, stepCount: out.stepCount, stoppedReason: out.stoppedReason, elapsedMs: out.summary.elapsedMs }, 耗时ms: Date.now() - t0 },
    );
  });
}