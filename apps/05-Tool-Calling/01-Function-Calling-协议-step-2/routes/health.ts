/**
 * 职责：GET /health —— 只读环境信息，不调模型。
 * 数据流：无 body → { ok, port, provider, model, hasKey, callsModel }；
 *   页面加载时打一次，用来填页脚 #env-info。
 *
 * step-2 真调 LLM：callsModel: true；hasKey 决定页面是否禁用主按钮（缺 Key 时主按钮 disabled）。
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
      callsModel: true, // step-2 真调 LLM；缺 Key 时主按钮应被 disable
    };
  });
}