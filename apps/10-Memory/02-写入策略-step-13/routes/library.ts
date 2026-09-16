/**
 * 职责：GET /api/library —— 给前端展示「库里现在有什么」用的列表接口。
 * 数据流：GET /api/library?userId=default → kvList(userId) → Record<string, unknown>
 *
 * 不调模型，只读库。给 8-B 审计表 sub-page 实时刷新库状态用。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { kvList } from "../lib/store-kv.js";
import { logger } from "../lib/logger.js";

export function mountLibraryRoutes(router: Router): void {
  router.get("/api/library", (ctx: Context) => {
    const userId = (ctx.query.userId as string) || "default";
    logger.info(
      "调用函数-library-route",
      "调用函数结束：GET /api/library",
      `为什么写这条日志：让 8-B 撤回前后能看见库里条数 + 值变化。当前：列 userId = ${userId}。`,
      { 返回值: { userId }, 字段释义: { "userId": "用户 ID（多用户 demo 用，本步固定 default）" } },
    );
    const rows = kvList(userId);
    ctx.body = rows;
  });
}
