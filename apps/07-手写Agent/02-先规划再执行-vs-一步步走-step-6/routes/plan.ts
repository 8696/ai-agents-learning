/**
 * 职责：GET /api/plan —— 只规划、不执行；返回 sessionId + plans + status=pending。
 * 数据流：query.task → planOnly → sessions.set → ctx.body。确认前不 invokeTool。
 * 为什么单独成文件：变体 F 第一阶段单独一个 URL；禁止和确认执行塞进同一个超级接口。
 */

import { randomUUID } from "node:crypto";
import type { Context } from "koa";
import type Router from "@koa/router";
import { planOnly } from "../lib/flow/plan.js";
import { sessions } from "../lib/flow/sessions.js";
import { logger } from "../lib/logger.js";
import { DEFAULT_TASK } from "../lib/types.js";

export function mountPlanRoutes(router: Router): void {
  router.get("/api/plan", async (ctx: Context) => {
    const task = String(ctx.query.task ?? DEFAULT_TASK);
    const sessionId = randomUUID();
    const t0 = Date.now();
    logger.info(
      "路由-plan",
      "调用函数开始：GET /api/plan",
      "为什么写这条日志：变体 F 阶段 1 —— 只调规划器，状态 pending 等用户点头。",
      { 入参: { task }, __code: "const v1 = await planOnly(task); sessions.set(sessionId, ...);" },
    );

    const v1 = await planOnly(task);
    sessions.set(sessionId, { task, initialSteps: v1.steps, rawText: v1.rawText, fallback: v1.fallback });

    ctx.body = {
      sessionId,
      task,
      plans: [v1],
      plannerIterations: 1,
      executeTrace: [],
      status: "pending",
    };
    logger.info(
      "路由-plan",
      "调用函数结束：GET /api/plan",
      "为什么写这条日志：plan 已就位；前端渲染待确认卡。确认前无副作用。",
      { 返回值: { sessionId, planStepsCount: v1.steps.length, status: "pending" }, 耗时ms: Date.now() - t0 },
    );
  });
}
