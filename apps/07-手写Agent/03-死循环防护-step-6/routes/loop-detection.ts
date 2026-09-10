/**
 * 职责：POST /api/agent/loop-detection —— 同工具循环检测闸（变体 6）。
 * 数据流：mock 模型永远调 queryStock("SKU-LOOP")；闸门 6 看最近 N-1 步的工具调用是不是同工具同参数；是则 stoppedReason=tool_call_loop。
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
  loopDetectionWindow: z.coerce.number().int().positive().max(10).default(3),
});

export function mountLoopDetectionRoutes(router: Router): void {
  router.post("/api/agent/loop-detection", async (ctx: Context, _next: Next) => {
    const parsed = query.safeParse(ctx.query);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join(".") || "param"}：${i.message}`).join("；");
      ctx.status = 400;
      ctx.body = { error: `输入有误：${issues}`, code: "INVALID_INPUT" };
      return;
    }
    const { maxSteps, latencyMsPerStep, loopDetectionWindow } = parsed.data;
    const t0 = Date.now();
    logger.info("路由-loop-detection", "调用函数开始：POST /api/agent/loop-detection", "演示同工具循环检测闸（变体 6）；mock 模型永远调同 sku。当前：loopDetectionWindow=" + loopDetectionWindow, { 入参: { maxSteps, latencyMsPerStep, loopDetectionWindow }, __code: "await runLoop({...})" });
    const out = await runLoop({
      enableMaxStepsGate: true,
      maxSteps,
      enableTimeoutGate: false,
      timeoutMs: 0,
      enableModelStopGate: false,
      enableUserCancelGate: false,
      enableToolRetryGate: false,
      enableToolCallLoopGate: true,
      loopDetectionWindow,
      useRealLlm: false,
      query: "",
      mockStopAt: 0,
      latencyMsPerStep,
      hardCap: HARD_CAP,
      label: `同工具循环检测 闸（window=${loopDetectionWindow}）`,
      abortSignal: null,
      toolMaxRetries: 0,
      flakyRate: 0,
      alwaysFail: false,
    });
    ctx.body = out;
    logger.info("路由-loop-detection", "调用函数结束：POST /api/agent/loop-detection", "收口；前端要把 stoppedReason=tool_call_loop + summary.recentToolCalls 亮出来。", { 返回值: { stepCount: out.stepCount, stoppedReason: out.stoppedReason, loopDetected: out.summary.loopDetected, recentToolCalls: out.summary.recentToolCalls, elapsedMs: out.summary.elapsedMs }, 耗时ms: Date.now() - t0 });
  });
}