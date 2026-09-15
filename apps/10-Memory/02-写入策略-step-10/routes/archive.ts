/**
 * 职责：GET /api/archive，列出已归档事实（archived_at 非 NULL）。
 * 数据流：listArchived(userId) → JSON
 *
 * 满足需求 6 验收 ①「时间快进后过期条目从召回候选里消失，但在「已归档」视图里仍在」——这一步是「已归档视图」入口。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { listArchived } from "../lib/flow/expiration.js";
import { logger } from "../lib/logger.js";

export function mountArchiveRoutes(router: Router): void {
  router.get("/api/archive", (ctx: Context) => {
    logger.info(
      "调用函数-archive",
      "调用函数开始：GET /api/archive",
      "为什么写这条日志：第 6 关「过期 ≠ 删除」——archived_at 非 NULL 的事实从 recall 候选消失，但归档视图仍可见原始记录（满足需求 6 验收 ①）。当前：准备按 userId 列归档事实。",
      { 入参: { userId: "default" } },
    );

    const t0 = Date.now();
    const archived = listArchived("default");
    const count = archived.length;
    logger.info(
      "调用函数-archive",
      "调用函数结束：GET /api/archive",
      `为什么写这条日志：让前端拿到已归档事实的清单。当前：列出完成，archived = ${count} 条。`,
      { 返回值: { archived, count }, 耗时ms: Date.now() - t0 },
    );

    ctx.body = { archived, count };
  });
}