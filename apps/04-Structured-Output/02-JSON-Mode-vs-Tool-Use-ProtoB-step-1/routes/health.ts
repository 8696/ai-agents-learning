/**
 * 职责：GET /health —— 只读环境信息，不调模型。协议 B 页脚用 modelB。
 * 数据流：无 body → { ok, port, provider, model, hasKey }。
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
      model: llm?.modelB ?? null,
      hasKey: Boolean(llm),
    };
  });
}
