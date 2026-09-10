/**
 * 职责：GET /api/plan-and-execute?task=short|long —— 只跑先规划再执行这一组。
 * 数据流：query.task → resolveTask → runPlanAndExecute → ctx.body。
 * 为什么单独成文件：四组各自请求；禁止在一个 handler 里 Promise.all 四条。
 */

import type { Context } from "koa";
import type Router from "@koa/router";
import { runPlanAndExecute } from "../lib/flow/plan-and-execute.js";
import { logger } from "../lib/logger.js";
import { resolveTask } from "../lib/types.js";

export function mountPlanAndExecuteRoutes(router: Router): void {
  router.get("/api/plan-and-execute", async (ctx: Context) => {
    const task = resolveTask(ctx.query.task ? String(ctx.query.task) : undefined);
    const t0 = Date.now();
    logger.info(
      "路由-plan-and-execute",
      "调用函数开始：GET /api/plan-and-execute",
      "为什么写这条日志：这一组自己的入口；下一步只跑先规划再执行。",
      { 入参: { task }, __code: "const planAndExecute = await runPlanAndExecute(task);" },
    );
    const planAndExecute = await runPlanAndExecute(task);
    ctx.body = planAndExecute;
    logger.info(
      "路由-plan-and-execute",
      "调用函数结束：GET /api/plan-and-execute",
      "为什么写这条日志：这一组收口；前端自己拿计划卡 + 执行卡。",
      { 返回值: { planCalls: planAndExecute.summary.planCalls, executeCalls: planAndExecute.summary.executeCalls, task }, 耗时ms: Date.now() - t0 },
    );
  });
}
