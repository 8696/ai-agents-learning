/**
 * 职责：查向量索引状态（GET /api/index-status）。
 * 数据流：返 IndexStatus（built + childCount + builtAt + buildDurationMs + vectorsDim + provider + embeddingModel）。
 * 为什么单独成文件：一个业务 URL 一个 route 文件（§5.3.8）；GET 跟 POST 是两条不同的业务路径。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { getIndexStatus } from "../lib/corpus/vector-index.js";

export function mountIndexStatusRoutes(router: Router): void {
  router.get("/api/index-status", (ctx: Context) => {
    ctx.body = getIndexStatus();
  });
}