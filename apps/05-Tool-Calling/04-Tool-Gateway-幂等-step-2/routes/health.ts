/**
 * 职责：GET /health —— 只读环境信息，不调模型。
 * 数据流：无 → → { ok, port, provider, model, hasKey, callsModel, tools, orderStats }；
 *   页面加载时写一次，用来填页脚 #env-info + 订单 DB 状态。
 *
 * step-2 真调 LLM（协议 B）：callsModel: true；主按钮因缺 Key 而 disabled（§5.3.9）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { PORT, llm } from "../lib/http/runtime-ctx.js";
import { getToolsMeta, getOrderStats } from "../lib/tools/registry.js";

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
      orderStats: getOrderStats(),
    };
  });
}