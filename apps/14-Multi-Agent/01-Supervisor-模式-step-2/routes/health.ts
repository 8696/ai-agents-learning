/**
 * 职责：GET /health，给页脚环境元信息。
 *
 * 数据流：getLlmOptional → { ok, port, provider, model, hasKey, callsModel }。
 * 本 Demo 默认调 LLM（编排者 + N 个工人 + 汇总者），所以 callsModel=true。
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
