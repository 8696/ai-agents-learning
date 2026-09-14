/**
 * 职责：GET /api/corpus。把服务端切块原样交给页面，前端不许自己编一份。
 */
import type { Context } from "koa";
import Router from "@koa/router";
import { CORPUS, COARSE_HINTS, DEFAULT_QUERY } from "../lib/corpus/knowledge-base.js";

export function mountCorpus(router: Router): void {
  router.get("/api/corpus", (ctx: Context) => {
    ctx.body = {
      ok: true,
      defaultQuery: DEFAULT_QUERY,
      coarseHints: COARSE_HINTS,
      chunks: CORPUS,
      count: CORPUS.length,
    };
  });
}
