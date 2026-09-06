/**
 * 职责：GET /health —— 只读环境信息，不调模型。
 * 数据流：无 body → { ok, port, provider, model, hasKey, callsModel }。
 *
 * step-6 真调 LLM：callsModel: true；hasKey 决定页面是否禁用主按钮。
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
      hasKey: Boolean(llm),
      callsModel: true,
    };
  });
}
