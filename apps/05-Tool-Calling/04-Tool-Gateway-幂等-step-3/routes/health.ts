/**
 * 职责：GET /health —— 只读环境信息，不调模型。
 * 数据流：无 → → { ok, port, provider, model, hasKey, callsModel, tools, oauthUsers }；
 *   页面加载时打一次，用来填页脚 #env-info + Tools 面板。
 *
 * step-3 真调 LLM（协议 B）：callsModel: true。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { PORT, llm } from "../lib/http/runtime-ctx.js";
import { getToolsMeta, getOAuthUsers } from "../lib/tools/registry.js";

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
      oauthUsers: getOAuthUsers(),
    };
  });
}