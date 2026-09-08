/**
 * 职责：GET /health —— 环境元信息，不调模型。
 */
import type Router from "@koa/router";
import type { Context, Next } from "koa";
import { getRuntimeCtx } from "../lib/http/runtime-ctx.js";
import { TOOL_NAMES } from "../lib/tools/registry.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context, _next: Next) => {
    const { port, llm } = getRuntimeCtx();
    ctx.body = {
      ok: true,
      port,
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      callsModel: true,
      protocol: "A",
      tools: TOOL_NAMES,
    };
  });
}
