/**
 * 职责：GET /api/blocking —— 攒齐同样总耗时再一次性返回（对照 TTFT）。
 *
 * 数据流：
 *   浏览器 GET /api/blocking
 *     → ?fail=1 时 400 JSON
 *     → 否则等 TOKENS.length × 200ms，再 text/plain 返回整句
 *
 * 为什么单独成文件：它不是 SSE，能用 ctx.body；和 /api/stream 拆开，避免「开了流又去设 ctx.body」。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { isIntentionalFail } from "../lib/http/request-guards.js";
import { waitBlockingText } from "../lib/flow/simulate.js";

export function mountBlockingRoutes(router: Router): void {
  router.get("/api/blocking", async (ctx: Context) => {
    if (isIntentionalFail(ctx)) {
      ctx.status = 400;
      ctx.body = {
        error: "故意触发的参数错误（query fail=1）。一次性对照不需要 Key。",
      };
      return;
    }

    const text = await waitBlockingText();
    ctx.type = "text/plain; charset=utf-8";
    ctx.body = text;
  });
}
