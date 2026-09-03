/**
 * 职责：GET /health —— 只读环境自检，不调模型、不花额度。
 *
 * 数据流：
 *   无 body → runtime-ctx 的 llm / PORT → { ok, port, provider, model, hasKey }
 *   → 每个页面加载时都会打一次，填页脚 #env-info（§5.3.9）
 *
 * 为什么单独成文件：它是唯一「不碰模型、也不推 SSE」的端点，写法（ctx.body）和流式路由完全不同。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm, PORT, PROTOCOL } from "../lib/http/runtime-ctx.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context) => {
    ctx.body = {
      ok: true,
      port: PORT,
      protocol: PROTOCOL,
      // provider / model 一律从这里下发：页面写死模型名就会和 apps/.env 对不上（§5.3.9）
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm),
    };
  });
}
