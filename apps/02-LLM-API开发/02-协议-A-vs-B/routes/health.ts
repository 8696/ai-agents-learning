/**
 * 职责：GET /health —— 环境元信息，不调模型。
 * 数据流：runtime-ctx → { ok, port, provider, model, modelB, hasKey }。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm, PORT } from "../lib/http/runtime-ctx.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    ctx.body = {
      ok: true,
      port: PORT,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      modelB: llm?.modelB ?? null,
      hasKey: Boolean(llm),
      baseUrlA: llm?.baseUrlA ?? null,
      baseUrlB: llm?.baseUrlB ?? null,
    };
  });
}
