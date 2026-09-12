/**
 * 职责：GET /api/corpus —— 返回内置知识库卡片（只读）。
 */
import type Router from "@koa/router";
import type { Context } from "koa";
import { CORPUS } from "../lib/corpus/knowledge-base.js";

export function mountCorpus(router: Router): void {
  router.get("/api/corpus", (ctx: Context) => {
    ctx.body = {
      ok: true,
      result: {
        cards: CORPUS.map((c) => ({ id: c.id, kind: c.kind, text: c.text, updatedAt: c.updatedAt })),
        count: CORPUS.length,
      },
    };
  });
}