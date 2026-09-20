/**
 * 职责：GET /health，给页脚环境元信息。不调模型。
 *
 * 数据流：getLlmOptional → { ok, port, provider, model, hasKey, callsModel }。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { getLlmOptional } from "../../../llm.js";
import { parseRuntimeCtx } from "../lib/http/runtime-ctx.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    const { PORT } = parseRuntimeCtx();
    const llm = getLlmOptional();
    ctx.body = {
      ok: true,
      port: PORT,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      callsModel: true,
    };
  });
}