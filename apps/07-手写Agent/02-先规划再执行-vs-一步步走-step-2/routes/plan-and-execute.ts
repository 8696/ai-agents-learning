/**
 * 职责：GET /api/plan-and-execute —— 只跑右栏「先规划再执行」（真规划器）。
 * 数据流：query.task → runPlanAndExecute → ctx.body。
 * 为什么单独成文件：对照右栏自己的请求；禁止在这里再跑一步步走。
 */

import type { Context } from "koa";
import type Router from "@koa/router";
import { runPlanAndExecute } from "../lib/flow/plan-and-execute.js";
import { logger } from "../lib/logger.js";
import { DEFAULT_TASK } from "../lib/types.js";

export function mountPlanAndExecuteRoutes(router: Router): void {
  router.get("/api/plan-and-execute", async (ctx: Context) => {
    const task = String(ctx.query.task ?? DEFAULT_TASK);
    const t0 = Date.now();
    logger.info(
      "路由-plan-and-execute",
      "调用函数开始：GET /api/plan-and-execute",
      "为什么写这条日志：右栏自己的入口；下一步只跑先规划再执行。",
      { 入参: { task }, __code: "const planAndExecute = await runPlanAndExecute(task);" },
    );
    const planAndExecute = await runPlanAndExecute(task);
    ctx.body = planAndExecute;
    logger.info(
      "路由-plan-and-execute",
      "调用函数结束：GET /api/plan-and-execute",
      "为什么写这条日志：右栏收口；前端自己拿计划卡 + 执行卡。",
      { 返回值: { planCalls: planAndExecute.summary.planCalls, executeCalls: planAndExecute.summary.executeCalls, plannerFallback: planAndExecute.plannerFallback }, 耗时ms: Date.now() - t0 },
    );
  });
}
