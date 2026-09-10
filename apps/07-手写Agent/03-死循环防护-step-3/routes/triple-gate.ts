/**
 * 职责：POST /api/agent/triple-gate —— max + timeout + model_stop 三闸叠加（step-3 · 真模型）。
 * 数据流：query + maxSteps + timeoutMs + latencyMsPerStep → runLoop({ enableMaxStepsGate: true, enableTimeoutGate: true, enableModelStopGate: true, useRealLlm: true }) → ctx.body。
 * 为什么单独成文件：§5.3.8 一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { runLoop } from "../lib/flow/loop.js";
import { logger } from "../lib/logger.js";

const HARD_CAP = 200;

const query = z.object({
  query: z.string().min(1).max(500).default("查 SKU-001 / SKU-002 / SKU-003 的库存，完成后输出 final_answer"),
  maxSteps: z.coerce.number().int().positive().max(1000).default(10),
  timeoutMs: z.coerce.number().int().positive().max(60_000).default(3000),
  latencyMsPerStep: z.coerce.number().int().nonnegative().max(2000).default(80),
});

export function mountTripleGateRoutes(router: Router): void {
  router.post("/api/agent/triple-gate", async (ctx: Context, _next: Next) => {
    const parsed = query.safeParse(ctx.query);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join(".") || "param"}：${i.message}`).join("；");
      ctx.status = 400;
      ctx.body = { error: `输入有误：${issues}`, code: "INVALID_INPUT" };
      return;
    }
    const { query: task, maxSteps, timeoutMs, latencyMsPerStep } = parsed.data;
    const t0 = Date.now();
    logger.info("路由-triple", "调用函数开始：POST /api/agent/triple-gate", "演示 max+timeout+model_stop 三闸叠加；真模型。当前：maxSteps=" + maxSteps + " · timeoutMs=" + timeoutMs, { 入参: { query: task, maxSteps, timeoutMs, latencyMsPerStep }, __code: "await runLoop(...)" });
    const out = await runLoop({
      enableMaxStepsGate: true,
      maxSteps,
      enableTimeoutGate: true,
      timeoutMs,
      enableModelStopGate: true,
      useRealLlm: true,
      query: task,
      mockStopAt: 0,
      latencyMsPerStep,
      hardCap: HARD_CAP,
      label: `三闸叠加（max=${maxSteps} · timeout=${timeoutMs}ms · model_stop=on）`,
    });
    ctx.body = out;
    logger.info("路由-triple", "调用函数结束：POST /api/agent/triple-gate", "收口", { 返回值: { stepCount: out.stepCount, stoppedReason: out.stoppedReason, elapsedMs: out.summary.elapsedMs }, 耗时ms: Date.now() - t0 });
  });
}