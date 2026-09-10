/**
 * 职责：POST /api/confirm-plan —— 只执行已保存的计划。禁止再跑一步步走。
 * 数据流：body.sessionId → sessions.get → executeFromPlan → sessions.delete → ctx.body。
 * 为什么单独成文件：变体 F 第二阶段单独一个 URL；旧代码在 confirm 里跑 A 路径是偷懒，这里删掉。
 */

import type { Context } from "koa";
import type Router from "@koa/router";
import { executeFromPlan } from "../lib/flow/execute-plan.js";
import { sessions } from "../lib/flow/sessions.js";
import { logger } from "../lib/logger.js";

export function mountConfirmPlanRoutes(router: Router): void {
  router.post("/api/confirm-plan", async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as { sessionId?: string };
    const sessionId = body.sessionId;
    const t0 = Date.now();
    logger.info(
      "路由-confirm",
      "调用函数开始：POST /api/confirm-plan",
      "为什么写这条日志：人点头了；之前 pending 的 plan 现在才执行。不跑一步步走。",
      { 入参: { sessionId }, __code: "const session = sessions.get(sessionId); const result = await executeFromPlan(...);" },
    );

    if (!sessionId) {
      ctx.status = 400;
      ctx.body = { error: "missing sessionId" };
      return;
    }
    const session = sessions.get(sessionId);
    if (!session) {
      ctx.status = 404;
      ctx.body = { error: "session not found or expired" };
      return;
    }

    const result = await executeFromPlan(session.task, session.initialSteps, session.rawText, session.fallback);
    sessions.delete(sessionId);

    ctx.body = {
      sessionId,
      task: session.task,
      plans: result.plans,
      plannerIterations: result.plannerIterations,
      executeTrace: result.executeTrace,
      finalAnswer: result.finalAnswer,
      status: "executed",
    };
    logger.info(
      "路由-confirm",
      "调用函数结束：POST /api/confirm-plan",
      "为什么写这条日志：人点头后执行；status → executed；前端渲染 executeTrace。",
      { 返回值: { plannerIterations: result.plannerIterations, executeCount: result.executeTrace.length, status: "executed" }, 耗时ms: Date.now() - t0 },
    );
  });
}
