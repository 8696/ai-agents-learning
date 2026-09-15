/**
 * 职责：GET /api/facts，列出事实库清单（默认排除软删除）。
 * 数据流：kvList("default") → { facts, count }
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { kvList } from "../lib/db.js";
import { logger } from "../lib/logger.js";

export function mountFactsRoutes(router: Router): void {
  router.get("/api/facts", async (ctx: Context) => {
    logger.info(
      "调用函数-facts",
      "调用函数开始：GET /api/facts",
      "为什么写这条日志：用户点了「查看事实库」按钮，列出该 user 下所有未软删的事实 + count，方便对照冲突动作是否生效（UPDATE / MERGE 改 value、DELETE 减 1）。",
      { 入参: { userId: "default" }, __code: "const facts = await kvList('default');" },
    );
    const t0 = Date.now();
    const facts = await kvList("default");
    const count = Object.keys(facts).length;
    logger.info(
      "调用函数-facts",
      "调用函数结束：GET /api/facts",
      `为什么写这条日志：要把库里的事实清单返回给页面 + 记下耗时。当前：列出完成，共 ${count} 条。`,
      { 返回值: { facts, count }, 耗时ms: Date.now() - t0 },
    );
    ctx.body = { facts, count };
  });
}
