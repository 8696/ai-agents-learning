/**
 * 职责：GET /health —— 只读环境信息，不调模型。
 * 数据流：无 body → { ok, port, provider, modelB, hasKey, callsModel }；
 *   页面加载时打一次，用来填页脚 #env-info。
 *
 * step-8 是真 LLM demo：调协议 B（Anthropic Messages API），所以 modelB 必填 + maxTokensB 必填。
 * callsModel: true；主按钮因缺 Key 而 disabled（§5.3.9）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { PORT, llm } from "../lib/http/runtime-ctx.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    ctx.body = {
      ok: true,
      port: PORT,
      provider: llm?.provider ?? null,
      model: llm?.modelB ?? null,        // step-8 只跑协议 B
      hasKey: Boolean(llm),
      callsModel: true,                   // step-8 真调 LLM
      maxTokensB: llm?.maxTokensB ?? null,
    };
  });
}