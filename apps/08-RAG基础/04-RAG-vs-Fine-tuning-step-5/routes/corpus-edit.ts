/**
 * 职责：「改公告」helper —— A5「混合：改公告后事实跟着变」的演示按钮触发。
 * 数据流：
 *   POST /api/corpus-edit 入参 { days: number, action: "set" | "reset" }
 *     → 调 addAnnouncement(days) 或 resetAnnouncement()
 *     → 修改 lib/rag/corpus.ts 内存里的 corpus
 *     → 下一次 /api/rag-mix 检索时立刻跟着变（search.ts 每次都基于当前 corpus 建索引）
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { addAnnouncement, resetAnnouncement } from "../lib/rag/corpus.js";
import { logger } from "../lib/logger.js";

export function mountCorpusEditRoute(router: Router): void {
  router.post("/api/corpus-edit", (ctx: Context) => {
    const t0 = Date.now();
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const action = body.action === "reset" ? "reset" : "set";
    const days = typeof body.days === "number" ? body.days : 7;

    logger.info(
      "server.corpus-edit",
      "调用函数开始：/api/corpus-edit",
      `为什么写这条日志：A5 「改公告」 helper；action=${action}; days=${days}。` +
        " 当前：路由收到请求；下一步修改 lib/rag/corpus.ts 内存里的 corpus。",
      { 入参: { action, days }, __code: "addAnnouncement(days) | resetAnnouncement()" },
    );

    const result = action === "reset" ? resetAnnouncement() : addAnnouncement(days);

    logger.info(
      "server.corpus-edit",
      "调用函数结束：/api/corpus-edit",
      "为什么写这条日志：让学习者看见 before / after —— 证明 corpus 真的改了。",
      {
        返回值: { action, days, before: result.before, after: result.after },
        耗时ms: Date.now() - t0,
      },
    );

    ctx.body = {
      action,
      days,
      before: result.before,
      after: result.after,
    };
  });
}