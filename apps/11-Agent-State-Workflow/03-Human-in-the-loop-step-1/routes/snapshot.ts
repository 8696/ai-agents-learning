/**
 * 职责：GET /api/snapshot —— 只读当前账本和待审批。
 * 数据流：校验无 body → getSnapshot → ctx.body。
 * 为什么单独成文件：一个业务 URL 一个文件；和提议 / 通过不是同一条路径。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { getSnapshot } from "../lib/flow/pause-before-side-effect.js";
import { logger } from "../lib/logger.js";

export function mountSnapshotRoutes(router: Router): void {
  router.get("/api/snapshot", (ctx: Context, _next: Next) => {
    const t0 = Date.now();
    logger.info(
      "GET /api/snapshot",
      "调用函数开始：GET /api/snapshot",
      "为什么写这条日志：页面加载时要先看见「尚未发生」。当前：路由只读。",
      { 入参: {}, __code: "const snapshot = getSnapshot(); ctx.body = { ok: true, snapshot };" },
    );
    const snapshot = getSnapshot();
    ctx.body = { ok: true, snapshot };
    logger.info(
      "GET /api/snapshot",
      "调用函数结束：GET /api/snapshot",
      "为什么写这条日志：把快照原文交给页面。当前：已写 200。",
      { 返回值: ctx.body, 耗时ms: Date.now() - t0 },
    );
  });
}
