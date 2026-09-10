/**
 * 职责：GET /health —— 只读环境信息，不调模型。
 * 数据流：无 body → { ok, port, provider, model, hasKey, callsModel }；
 *   页面加载时写一次，用来填页脚 #env-info。
 *
 * step-3 走 §5.3.0 默认调真模型：model-stop / triple 端点会真调模型。
 * callsModel: true → hasKey=false 时主按钮 disabled。
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
      callsModel: false,
    };
  });
}