/**
 * 职责：GET /api/corpus，返回服务端 8 个切块（和 step-1 / step-2 同款）。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { CHUNKS, DEFAULT_QUERY, TARGET_ID } from "../lib/corpus/chunks.js";

export function mountCorpusRoutes(router: Router): void {
  router.get("/api/corpus", (ctx: Context, _next: Next) => {
    ctx.body = {
      ok: true,
      chunks: CHUNKS,
      defaultQuery: DEFAULT_QUERY,
      targetId: TARGET_ID,
    };
  });
}