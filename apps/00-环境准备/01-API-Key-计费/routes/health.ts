/**
 * 职责：GET /health —— 只读的环境元信息，不调模型、不花钱。
 * 数据流：runtime-ctx（PORT / llm）+ pricing（示例单价）→ JSON → 每个页面的页脚 #env-info。
 * 为什么单独成文件：三个页面加载时都打它；它和计费业务无关，混进 billing route 会被误以为要花钱。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm, PORT } from "../lib/http/runtime-ctx.js";
import { PRICING } from "../lib/billing/pricing.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    ctx.body = {
      ok: true,
      port: PORT,
      // provider / model 一律从 apps/llm.ts 读，页面禁止写死：换 LLM_PROVIDER 页脚要跟着变
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
      // 单价随响应下发，总览页的价目表因此不需要在 HTML 里抄一份数字
      pricing: PRICING,
    };
  });
}
