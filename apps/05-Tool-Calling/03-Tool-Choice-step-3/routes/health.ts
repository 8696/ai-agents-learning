/**
 * 职责：GET /health。
 */
import type Router from "@koa/router";
import type { Context, Next } from "koa";
import { getRuntimeCtx } from "../lib/http/runtime-ctx.js";
import { SWITCHES } from "../lib/switches/product-switches.js";
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
      switches: SWITCHES.map((s) => ({ id: s.id, label: s.label, mapsTo: s.mapsTo })),
    };
  });
}
