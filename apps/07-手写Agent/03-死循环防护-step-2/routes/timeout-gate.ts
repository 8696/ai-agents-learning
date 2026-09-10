/**
 * 职责：POST /api/agent/timeout-gate —— timeout 单闸（step-2）。
 * 数据流：query.timeoutMs + latencyMsPerStep → runLoop({ enableTimeoutGate: true }) → ctx.body。
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
      logger.warn(
        "路由-timeout",
        "调用函数结束：POST /api/agent/timeout-gate（输入校验失败）",
        "为什么写这条日志：第二类错误。当前：issues=" + issues,
        { 返回值: { issues, rawQuery: ctx.query }, 耗时ms: 0 },
      );
      ctx.status = 400;
      ctx.body = { error: `输入有误：${issues}`, code: "INVALID_INPUT" };
      return;
    }
    const { timeoutMs, latencyMsPerStep } = parsed.data;

    const t0 = Date.now();
    logger.info(
      "路由-timeout",
      "调用函数开始：POST /api/agent/timeout-gate",
      "为什么写这条日志：演示「timeout 单闸」；到 timeoutMs 就 break，latencyMsPerStep 让闸门真能触发。当前：timeoutMs=" + timeoutMs + " · latency=" + latencyMsPerStep + "ms",
      { 入参: { timeoutMs, latencyMsPerStep, hardCap: HARD_CAP }, __code: "const out = await runLoop({ enableMaxStepsGate: false, maxSteps: 0, enableTimeoutGate: true, timeoutMs, latencyMsPerStep, hardCap, label: 'timeout 单闸' });" },
    );
    const out = await runLoop({
      enableMaxStepsGate: false,
      maxSteps: 0,
      enableTimeoutGate: true,
      timeoutMs,
      latencyMsPerStep,
      hardCap: HARD_CAP,
      label: `timeout 单闸（timeout = ${timeoutMs}ms）`,
    });
    ctx.body = out;
    logger.info(
      "路由-timeout",
      "调用函数结束：POST /api/agent/timeout-gate",
      "为什么写这条日志：收口；前端要把 stoppedReason=timeout + elapsedMs 亮出来。",
      { 返回值: { label: out.label, stepCount: out.stepCount, stoppedReason: out.stoppedReason, elapsedMs: out.summary.elapsedMs }, 耗时ms: Date.now() - t0 },
    );
  });
}