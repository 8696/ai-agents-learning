/**
 * 职责：GET /health —— 只读环境信息，不调模型。
 * step-4 真调 LLM（协议 B）：callsModel: true。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { PORT, llm } from "../lib/http/runtime-ctx.js";
import { getToolsMeta } from "../lib/tools/registry.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    ctx.body = {
      ok: true,
      port: PORT,
      provider: llm?.provider ?? null,
      model: llm?.modelB ?? null,
      hasKey: Boolean(llm),
      callsModel: true,
      maxTokensB: llm?.maxTokensB ?? null,
      tools: getToolsMeta(),
      gatewayHooks: [],
    };
  });
}