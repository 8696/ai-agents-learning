/**
 * 职责：GET /api/run/memory/:runId。看这一件任务运行现在在不在内存里，磁盘上有没有文件。
 * 数据流：路径上的 runId → memoryStatus → 返回 inMemory + 检查点（若有）。
 * 为什么单独成文件：一个业务 URL 一个文件。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";
import { memoryStatus } from "../lib/flow/durable-resume.js";

export function mountMemoryGetRoutes(router: Router): void {
  router.get("/api/run/memory/:runId", (ctx: Context, _next: Next) => {
    const started = Date.now();
    const runId = String(ctx.params.runId ?? "").trim();
    logger.info(
      "路由-内存状态",
      "调用函数开始：GET /api/run/memory/:runId",
      "为什么写这条日志：页面要对照「内存里有没有」和「磁盘上有没有」。当前：刚进路由。",
      { 入参: { runId } },
    );
    if (!runId) {
      ctx.status = 400;
      ctx.body = { ok: false, error: { code: "BAD_RUN_ID", message: "路径里缺少任务运行编号（runId）。" } };
      logger.error(
        "路由-内存状态",
        "调用函数结束：GET /api/run/memory/:runId（失败）",
        "为什么写这条日志：路径里没有任务运行编号。当前：已返回 400。",
        { 返回值: ctx.body, 耗时ms: Date.now() - started },
      );
      return;
    }
    const result = memoryStatus(runId);
    ctx.body = {
      ok: true,
      ...result,
      请求参数: { runId },
      调用流程: ["查内存表", "读磁盘检查点（没有则为空）"],
    };
    logger.info(
      "路由-内存状态",
      "调用函数结束：GET /api/run/memory/:runId",
      "为什么写这条日志：对照已经算完。当前：把 inMemory 交给页面。",
      { 返回值: ctx.body, 耗时ms: Date.now() - started },
    );
  });
}
