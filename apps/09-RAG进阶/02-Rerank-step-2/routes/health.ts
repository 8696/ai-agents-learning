/**
 * 职责：GET /health。只读环境，不调模型。
 */
import type { Context } from "koa";
import Router from "@koa/router";
import { getLlmOptional } from "../../../llm.js";
import { PORT } from "../lib/http/runtime-ctx.js";

export function mountHealth(router: Router): void {
  router.get("/health", (ctx: Context) => {
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
