/**
 * 职责：POST /api/agent/with-gate —— max iterations 单闸（step-2 版 · 带 latencyMsPerStep）。
 * 数据流：query.maxSteps + latencyMsPerStep → runLoop({ enableMaxStepsGate: true, enableTimeoutGate: false }) → ctx.body。
 * 为什么单独成文件：§5.3.8 一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { runLoop } from "../lib/flow/loop.js";
import { logger } from "../lib/logger.js";

const HARD_CAP = 200;

const gateQuery = z.object({
  maxSteps: z.coerce.number().int().positive().max(1000).default(5),
  latencyMsPerStep: z.coerce.number().int().nonnegative().max(2000).default(0),
});

export function mountWithGateRoutes(router: Router): void {
  router.post("/api/agent/with-gate", async (ctx: Context, _next: Next) => {
    const parsed = gateQuery.safeParse(ctx.query);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join(".") || "param"}：${i.message}`).join("；");
      logger.warn(
        "路由-单闸",
        "调用函数结束：POST /api/agent/with-gate（输入校验失败）",
        "为什么写这条日志：第二类错误（用户输入错）。当前：issues=" + issues,
        { 返回值: { issues, rawQuery: ctx.query }, 耗时ms: 0 },
      );
      ctx.status = 400;
      ctx.body = { error: `输入有误：${issues}`, code: "INVALID_INPUT" };
      return;
    }
    const { maxSteps, latencyMsPerStep } = parsed.data;

    const t0 = Date.now();
    logger.info(
      "路由-单闸",
      "调用函数开始：POST /api/agent/with-gate",
      "为什么写这条日志：演示「max iterations 单闸」；到 maxSteps 就 break。当前：maxSteps=" + maxSteps + " · latency=" + latencyMsPerStep + "ms",
      { 入参: { maxSteps, latencyMsPerStep, hardCap: HARD_CAP }, __code: "const out = await runLoop({ enableMaxStepsGate: true, maxSteps, latencyMsPerStep, enableTimeoutGate: false, timeoutMs: 0, hardCap, label: 'max iterations 单闸' });" },
    );
    const out = await runLoop({
      enableMaxStepsGate: true,
      maxSteps,
      enableTimeoutGate: false,
      timeoutMs: 0,
      latencyMsPerStep,
      hardCap: HARD_CAP,
      label: `max iterations 单闸（max steps = ${maxSteps}）`,
    });
    ctx.body = out;
    logger.info(
      "路由-单闸",
      "调用函数结束：POST /api/agent/with-gate",
      "为什么写这条日志：收口；前端要把 stoppedReason + stepCount + elapsedMs 三个数字亮出来。",
      { 返回值: { label: out.label, stepCount: out.stepCount, stoppedReason: out.stoppedReason, elapsedMs: out.summary.elapsedMs }, 耗时ms: Date.now() - t0 },
    );
  });
}