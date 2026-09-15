/**
 * 职责：GET /api/facts，列出事实库清单。
 *
 * 数据流：kvList("default") → { facts: Record<string, 业务 value>, count }
 *
 * 这是 step-7 简化版「事实库 + 去重」的「看一眼库里有什么」入口：用户点 [查看事实库] 按钮
 * 就会调这个端点，看到所有 key / value / type / 写入时间。
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
      "为什么写这条日志：用户点了「查看事实库」按钮，列出该 user 下的所有事实 + count，方便对照查重是否生效（同 key + 同 value 点两次 [写入]，第二次应返回 noop）。",
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