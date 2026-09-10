/**
 * 职责：POST /api/cancel/:runId —— 用户中途取消（变体 4 · AbortController）。
 * 数据流：route 不调 runLoop；从 runHandles 取 controller，abort() → 跑动里 while 检测到 abortSignal.aborted → break。
 * 为什么单独成文件：§5.3.8 一个业务 URL 一个文件；且这是 route 里**唯一**会改进程状态、不写 ctx.body 的端点。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { abortRun } from "./runs.js";
import { logger } from "../lib/logger.js";

export function mountCancelRoutes(router: Router): void {
  router.post("/api/cancel/:runId", async (ctx: Context, _next: Next) => {
    const runId = String(ctx.params.runId ?? "").trim();
    if (!runId) {
      ctx.status = 400;
      ctx.body = { error: "runId 不能为空", code: "INVALID_INPUT" };
      return;
    }
    const t0 = Date.now();
    logger.info(
      "路由-cancel",
      "调用函数开始：POST /api/cancel/:runId",
      "为什么写这条日志：用户取消闸的入口；route 只改 controller.abort()，不写 ctx.body。当前：runId=" + runId,
      { 入参: { runId }, __code: "const r = abortRun(runId);" },
    );
    const r = abortRun(runId);
    ctx.body = { runId, ...r };
    logger.info(
      "路由-cancel",
      "调用函数结束：POST /api/cancel/:runId",
      "为什么写这条日志：收口；前端拿 r.ok 决定要不要更新按钮文案（已取消 vs 找不到）。",
      { 返回值: { runId, ok: r.ok, reason: r.reason }, 耗时ms: Date.now() - t0 },
    );
  });
}