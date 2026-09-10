/**
 * 职责：GET /api/agent/run-status/:runId —— 轮询拿 run 结果。
 * 数据流：ctx.params.runId → getRunHandle → 未结束返 { status: "running" }；结束返 { status, ...result }。
 * 为什么单独成文件：§5.3.8 一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { getRunHandle } from "./runs.js";
import { logger } from "../lib/logger.js";

export function mountRunStatusRoutes(router: Router): void {
  router.get("/api/agent/run-status/:runId", async (ctx: Context, _next: Next) => {
    const runId = String(ctx.params.runId ?? "").trim();
    const h = getRunHandle(runId);
    if (!h) {
      ctx.status = 404;
      ctx.body = { error: `找不到 runId=${runId}`, code: "NOT_FOUND" };
      return;
    }
    if (h.finished) {
      const r = await h.promise;
      ctx.body = { runId, status: h.aborted ? "cancelled" : "finished", ...r };
      return;
    }
    logger.info(
      "路由-run-status",
      "调用函数：GET /api/agent/run-status/:runId",
      "为什么写这条日志：轮询中；让前端知道「还在跑」。当前：runId=" + runId,
      { 入参: { runId } },
    );
    ctx.body = { runId, status: "running" };
  });
}