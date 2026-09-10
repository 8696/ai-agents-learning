/**
 * 职责：GET /api/step-by-step —— 只跑左栏「一步步走」。
 * 数据流：query.task → runStepByStep → ctx.body。
 * 为什么单独成文件：对照两侧必须分请求；本文件不碰规划路径。
 */

import type { Context } from "koa";
import type Router from "@koa/router";
import { runStepByStep } from "../lib/flow/step-by-step.js";
import { logger } from "../lib/logger.js";
import { DEFAULT_TASK } from "../lib/types.js";

export function mountStepByStepRoutes(router: Router): void {
  router.get("/api/step-by-step", async (ctx: Context) => {
    const task = String(ctx.query.task ?? DEFAULT_TASK);
    const t0 = Date.now();
    logger.info(
      "路由-step-by-step",
      "调用函数开始：GET /api/step-by-step",
      "为什么写这条日志：左栏自己的入口；下一步只跑一步步走，不打包右栏。",
      { 入参: { task }, __code: "const stepByStep = await runStepByStep(task);" },
    );
    const stepByStep = await runStepByStep(task);
    ctx.body = stepByStep;
    logger.info(
      "路由-step-by-step",
      "调用函数结束：GET /api/step-by-step",
      "为什么写这条日志：左栏收口；前端自己拿返回值画轨迹。",
      { 返回值: { rounds: stepByStep.summary.rounds, modelCalls: stepByStep.summary.modelCalls }, 耗时ms: Date.now() - t0 },
    );
  });
}
