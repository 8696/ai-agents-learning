/**
 * 职责：GET /api/step-by-step?task=short|long —— 只跑一步步走这一组。
 * 数据流：query.task → resolveTask → runStepByStep → ctx.body。
 * 为什么单独成文件：四组各自请求；本文件不碰规划路径，也不打包另一组。
 */

import type { Context } from "koa";
import type Router from "@koa/router";
import { runStepByStep } from "../lib/flow/step-by-step.js";
import { logger } from "../lib/logger.js";
import { resolveTask } from "../lib/types.js";

export function mountStepByStepRoutes(router: Router): void {
  router.get("/api/step-by-step", async (ctx: Context) => {
    const task = resolveTask(ctx.query.task ? String(ctx.query.task) : undefined);
    const t0 = Date.now();
    logger.info(
      "路由-step-by-step",
      "调用函数开始：GET /api/step-by-step",
      "为什么写这条日志：这一组自己的入口；下一步只跑一步步走。",
      { 入参: { task }, __code: "const stepByStep = await runStepByStep(task);" },
    );
    const stepByStep = await runStepByStep(task);
    ctx.body = stepByStep;
    logger.info(
      "路由-step-by-step",
      "调用函数结束：GET /api/step-by-step",
      "为什么写这条日志：这一组收口；前端自己拿返回值画轨迹。",
      { 返回值: { rounds: stepByStep.summary.rounds, modelCalls: stepByStep.summary.modelCalls, task }, 耗时ms: Date.now() - t0 },
    );
  });
}
