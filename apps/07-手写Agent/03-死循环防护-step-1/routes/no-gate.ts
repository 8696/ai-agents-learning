/**
 * 职责：POST /api/agent/no-gate —— 反例（不装闸）。
 * 数据流：固定 hardCap=200 → runLoop({ enableMaxStepsGate: false }) → ctx.body。
 * 为什么单独成文件：§5.3.8 一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { runLoop } from "../lib/flow/loop.js";
import { logger } from "../lib/logger.js";

const HARD_CAP = 200;

export function mountNoGateRoutes(router: Router): void {
  router.post("/api/agent/no-gate", async (ctx: Context, _next: Next) => {
    const t0 = Date.now();
    logger.info(
      "路由-反例",
      "调用函数开始：POST /api/agent/no-gate",
      "为什么写这条日志：演示「不装闸会怎样」；走到 hardCap 才会停。当前：准备调 runLoop（gate=false）。",
      { 入参: { hardCap: HARD_CAP }, __code: "const out = await runLoop({ enableMaxStepsGate: false, hardCap, maxSteps: 0, label: '反例（不装闸）' });" },
    );
    const out = await runLoop({
      enableMaxStepsGate: false,
      maxSteps: 0,
      hardCap: HARD_CAP,
      label: "反例（不装闸）",
    });
    ctx.body = out;
    logger.info(
      "路由-反例",
      "调用函数结束：POST /api/agent/no-gate",
      "为什么写这条日志：收口；前端要把 stepCount / tokenEstimate / stoppedReason=never_stopped 三个数字亮出来。",
      { 返回值: { label: out.label, stepCount: out.stepCount, stoppedReason: out.stoppedReason, tokenEstimate: out.tokenEstimate }, 耗时ms: Date.now() - t0 },
    );
  });
}