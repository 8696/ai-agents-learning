/**
 * 职责：GET /health —— 只读环境信息，不调模型。
 * 数据流：无 body → { ok, port, provider, model, hasKey, callsModel }；
 *   页面加载时打一次，用来填页脚 #env-info。
 *
 * 本条真调 LLM（每次点「跑对比」按钮 2 次：裁剪前 1 次 + 裁剪后 1 次）：
 *   callsModel: true；hasKey 决定页面是否禁用主按钮（缺 Key 时主按钮 disabled）。
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
