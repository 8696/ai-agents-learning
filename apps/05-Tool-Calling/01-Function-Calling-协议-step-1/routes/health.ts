/**
 * 职责：GET /health —— 只读环境信息，不调模型。
 * 数据流：无 body → { ok, port, provider, model, hasKey, callsModel }；
 *   页面加载时打一次，用来填页脚 #env-info。
 *
 * step-1 是 sketch：不调 LLM，callsModel: false 告诉页面「主按钮不因缺 Key 而 disabled」（§5.3.9）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm, PORT } from "../lib/http/runtime-ctx.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    ctx.body = {
      ok: true,
      port: PORT,
      // provider / model 只能从这里来：页面写死模型名，换 LLM_PROVIDER 后页脚就在骗人。
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      callsModel: false,
    };
  });
}