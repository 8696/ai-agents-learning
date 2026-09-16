/**
 * 职责：GET /api/library —— 给前端展示「库里现在有什么」用的列表接口（FactRow[]）。
 * 数据流：GET /api/library?userId=default → kvListForDisplay(userId) → FactRow[]
 *
 * 不调模型，只读库。给 auto-merge sub-page（变体 7-D）实时刷新库状态用。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { kvListForDisplay } from "../lib/db.js";
import { logger } from "../lib/logger.js";

export function mountLibraryRoutes(router: Router): void {
  router.get("/api/library", (ctx: Context) => {
    const userId = (ctx.query.userId as string) || "default";
    logger.info(
      "调用函数-library-route",
      "调用函数结束：GET /api/library",
      `为什么写这条日志：让 auto-merge sub-page 实时刷新库状态用，看「写入新事实 → 超阈自动合并」前后库里到底有什么变化。当前：列 userId = ${userId}。`,
      { 返回值: { userId, factCount: -1 }, 字段释义: { "userId": "用户 ID（多用户 demo 用，本步固定 default）" } },
    );
    const rows = kvListForDisplay(userId);
    ctx.body = rows;
  });
}