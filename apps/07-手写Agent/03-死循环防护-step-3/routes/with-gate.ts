/**
 * 职责：POST /api/agent/with-gate —— max iterations 单闸（step-3 版 · mock）。
 * 数据流：query.maxSteps + latencyMsPerStep → runLoop({ enableMaxStepsGate: true, useRealLlm: false }) → ctx.body。
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
      ctx.status = 400;
      ctx.body = { error: `输入有误：${issues}`, code: "INVALID_INPUT" };
      return;
    }
    const { maxSteps, latencyMsPerStep } = parsed.data;
    const t0 = Date.now();
    logger.info("路由-单闸", "调用函数开始：POST /api/agent/with-gate", "演示 max iterations 单闸；mock 模型。当前：maxSteps=" + maxSteps, { 入参: { maxSteps, latencyMsPerStep }, __code: "await runLoop(...)" });
    const out = await runLoop({
      enableMaxStepsGate: true,
      maxSteps,
      enableTimeoutGate: false,
      timeoutMs: 0,
      enableModelStopGate: false,
      useRealLlm: false,
      query: "",
      mockStopAt: 0,
      latencyMsPerStep,
      hardCap: HARD_CAP,
      label: `max iterations 单闸（max steps = ${maxSteps}）`,
    });
    ctx.body = out;
    logger.info("路由-单闸", "调用函数结束：POST /api/agent/with-gate", "收口", { 返回值: { stepCount: out.stepCount, stoppedReason: out.stoppedReason, elapsedMs: out.summary.elapsedMs }, 耗时ms: Date.now() - t0 });
  });
}