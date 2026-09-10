/**
 * 职责：POST /api/agent/with-gate —— max iterations 闸（step-1 基础版）。
 * 数据流：query.maxSteps → runLoop({ enableMaxStepsGate: true }) → ctx.body。
 * 为什么单独成文件：§5.3.8 一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { runLoop } from "../lib/flow/loop.js";
import { logger } from "../lib/logger.js";

const HARD_CAP = 200;

const gateQuery = z.object({
  maxSteps: z.coerce.number().int().positive().max(1000).default(10),
});

export function mountWithGateRoutes(router: Router): void {
  router.post("/api/agent/with-gate", async (ctx: Context, _next: Next) => {
    const parsed = gateQuery.safeParse(ctx.query);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => `${i.path.join(".") || "maxSteps"}：${i.message}`).join("；");
      logger.warn(
        "路由-闸门",
        "调用函数结束：POST /api/agent/with-gate（输入校验失败）",
        "为什么写这条日志：第二类错误（用户输入错）。当前：issues=" + issues,
        { 返回值: { issues, rawQuery: ctx.query }, 耗时ms: 0 },
      );
      ctx.status = 400;
      ctx.body = { error: `输入有误：${issues}`, code: "INVALID_INPUT" };
      return;
    }
    const maxSteps = parsed.data.maxSteps;

    const t0 = Date.now();
    logger.info(
      "路由-闸门",
      "调用函数开始：POST /api/agent/with-gate",
      "为什么写这条日志：演示「装上 max iterations 闸会怎样」；到 maxSteps 就 break。当前：maxSteps=" + maxSteps,
      { 入参: { maxSteps, hardCap: HARD_CAP }, __code: "const out = await runLoop({ enableMaxStepsGate: true, maxSteps, hardCap, label: '闸门版（max steps）' });" },
    );
    const out = await runLoop({
      enableMaxStepsGate: true,
      maxSteps,
      hardCap: HARD_CAP,
      label: `闸门版（max steps = ${maxSteps}）`,
    });
    ctx.body = out;
    logger.info(
      "路由-闸门",
      "调用函数结束：POST /api/agent/with-gate",
      "为什么写这条日志：收口；前端要把 stoppedReason=max_steps 与触发位置亮出来。",
      { 返回值: { label: out.label, stepCount: out.stepCount, stoppedReason: out.stoppedReason, tokenEstimate: out.tokenEstimate }, 耗时ms: Date.now() - t0 },
    );
  });
}