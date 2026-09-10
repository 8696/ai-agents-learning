/**
 * 职责：GET /health —— 只读环境信息，不调模型。
 * 数据流：无 body → { ok, port, provider, model, hasKey, callsModel, tools, gatewayHooks }；
 *   页面加载时写一次，用来填页脚 #env-info + Tools 面板。
 *
 * step-1 真调 LLM（协议 B）：callsModel: true；主按钮因缺 Key 而 disabled（§5.3.9）。
 *   本条还把 Gateway 钩子清单 + 工具名放进 /health，让页脚 / 教学区可见。
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
      model: llm?.modelB ?? null, // step-1 只跑协议 B
      hasKey: Boolean(llm),
      callsModel: true, // step-1 真调 LLM
      maxTokensB: llm?.maxTokensB ?? null,
      tools: getToolsMeta(),
      gatewayHooks: ["auth", "quota", "danger"],
    };
  });
}