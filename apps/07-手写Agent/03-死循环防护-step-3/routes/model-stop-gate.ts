/**
 * 职责：POST /api/agent/model-stop-gate —— model_says_stop 单闸（step-3 · 真模型）。
 * 数据流：query.maxSteps + query + latencyMsPerStep → runLoop({ enableModelStopGate: true, useRealLlm: true }) → ctx.body。
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
  maxSteps: z.coerce.number().int().positive().max(1000).default(20),
  latencyMsPerStep: z.coerce.number().int().nonnegative().max(2000).default(0),
});

export function mountModelStopGateRoutes(router: Router): void {
  router.post("/api/agent/model-stop-gate", async (ctx: Context, _next: Next) => {
    const parsed = query.safeParse(ctx.query);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join(".") || "param"}：${i.message}`).join("；");
      ctx.status = 400;
      ctx.body = { error: `输入有误：${issues}`, code: "INVALID_INPUT" };
      return;
    }
    const { query: task, maxSteps, latencyMsPerStep } = parsed.data;
    const t0 = Date.now();
    logger.info("路由-model_stop", "调用函数开始：POST /api/agent/model-stop-gate", "演示 model_says_stop 单闸；真模型，看 finish_reason。当前：query=" + task.slice(0, 60) + " · maxSteps=" + maxSteps, { 入参: { query: task, maxSteps, latencyMsPerStep }, __code: "await runLoop(...)" });
    const out = await runLoop({
      enableMaxStepsGate: true,
      maxSteps,
      enableTimeoutGate: false,
      timeoutMs: 0,
      enableModelStopGate: true,
      useRealLlm: true,
      query: task,
      mockStopAt: 0,
      latencyMsPerStep,
      hardCap: HARD_CAP,
      label: `model_says_stop 单闸（query=${task.slice(0, 40)}）`,
    });
    ctx.body = out;
    logger.info("路由-model_stop", "调用函数结束：POST /api/agent/model-stop-gate", "收口；前端要把 stoppedReason=model_says_stop + finalAnswer 亮出来", { 返回值: { stepCount: out.stepCount, stoppedReason: out.stoppedReason, elapsedMs: out.summary.elapsedMs, finalAnswer: out.summary.finalAnswer }, 耗时ms: Date.now() - t0 });
  });
}