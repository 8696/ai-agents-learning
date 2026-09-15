/**
 * 职责：GET /api/status，写入时机本页全景——事实库条数 + 后台 run 队列 + 待结算会话列表。
 * 数据流：kvList("default") + listBackgroundRuns() + listPendingConversations() → JSON
 *
 * 页面每 2 秒轮询一次，方便看到「background 完成后库条数 +N」「session-end close 完成后库条数 +N」。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { kvList } from "../lib/db.js";
import { listBackgroundRuns, listPendingConversations } from "../lib/flow/trigger-state.js";
import { logger } from "../lib/logger.js";

export function mountStatusRoutes(router: Router): void {
  router.get("/api/status", async (ctx: Context) => {
    const facts = await kvList("default");
    const factsCount = Object.keys(facts).length;
    const status = {
      factsCount,
      backgroundRuns: listBackgroundRuns(),
      pendingConversations: listPendingConversations(),
    };
    logger.info(
      "调用函数-status",
      "调用函数结束：GET /api/status",
      `为什么写这条日志：让页面顶部「事实库当前条数 + 后台队列长度 + 待结算会话」实时刷新。当前：factsCount = ${factsCount}，backgroundRuns = ${status.backgroundRuns.length}，pendingConversations = ${status.pendingConversations.length}。`,
      { 返回值: status },
    );
    ctx.body = status;
  });
}
