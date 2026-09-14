/**
 * 职责：GET /api/corpus，把服务端切块原样交给页面。前端禁止另写一份正文。
 * 数据流：CHUNKS + DEFAULT_QUERY → JSON。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { CHUNKS, DEFAULT_QUERY, TARGET_ID } from "../lib/corpus/chunks.js";
import { logger } from "../lib/logger.js";

export function mountCorpusRoutes(router: Router): void {
  router.get("/api/corpus", (ctx: Context, _next: Next) => {
    const t0 = Date.now();
    logger.info(
      "调用函数-GET /api/corpus",
      "调用函数开始：GET /api/corpus",
      "为什么写这条日志：页面一打开就要看见库里到底有哪些切块。当前：只读服务端数组。",
      { 入参: {} },
    );
    const body = {
      ok: true,
      defaultQuery: DEFAULT_QUERY,
      targetId: TARGET_ID,
      chunks: CHUNKS,
    };
    ctx.body = body;
    logger.info(
      "调用函数-GET /api/corpus",
      "调用函数结束：GET /api/corpus",
      "为什么写这条日志：切块正文只从这里出，前端不能写死一份。当前：已返回 8 条。",
      { 返回值: body, 耗时ms: Date.now() - t0, __code: "ctx.body = { ok: true, chunks: CHUNKS };" },
    );
  });
}
