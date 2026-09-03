/**
 * 职责：GET /health —— 只读环境自检，不调模型、不花额度。
 * 数据流：无 body → runtime-ctx 的 llm / PORT → JSON。
 *   每个页面加载时打一次，填页脚 #env-info（§5.3.9）；总览页还用它画三场景导航。
 * 为什么单独成文件：它是唯一「不碰模型」的端点，和三条 SSE 的写法完全不同（这里能用 ctx.body）。
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
      endpoints: [
        "POST /api/full",
        "POST /api/cancel-after-frames",
        "POST /api/no-signal-abort",
      ],
    };
  });
}
