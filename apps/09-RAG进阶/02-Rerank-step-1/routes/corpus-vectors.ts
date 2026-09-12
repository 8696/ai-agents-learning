/**
 * 职责：GET /api/corpus-vectors —— 返回语料向量的预览（前 8 维 + 范数）。
 *       不调网络：只读缓存。第一次跑粗召回之前 cached=false。
 */
import type Router from "@koa/router";
import type { Context } from "koa";
import { previewCorpusVectors } from "../lib/flow/recall.js";

export function mountCorpusVectors(router: Router): void {
  router.get("/api/corpus-vectors", (ctx: Context) => {
    ctx.body = { ok: true, result: previewCorpusVectors() };
  });
}