/**
 * 职责：GET /health，只读环境，不调模型。
 * 数据流：runtime-ctx 的 PORT / llm → JSON（含 embeddingModel 字段，HyDE 必需）。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { PORT, llm } from "../lib/http/runtime-ctx.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context, _next: Next) => {
    ctx.body = {
      ok: true,
      port: PORT,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      embeddingModel: llm?.embeddingModel ?? null,
      hasKey: Boolean(llm),
      hasEmbeddingModel: Boolean(llm?.embeddingModel),
      callsModel: true,
    };
  });
}