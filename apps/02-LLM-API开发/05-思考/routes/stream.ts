/**
 * 职责：POST /api/stream —— 薄分叉：闸门之后按 protocol 交给 A 或 B 两个 handler。
 * 数据流：body.protocol === "A" → handleStreamA（openai）；否则 handleStreamB（anthropic）。
 * if 只出现在这里，禁止下沉到 lib/ 里再按协议分叉。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { parseStreamBody, requireProviderLlm } from "../lib/http/request-guards.js";
import { handleStreamA } from "./stream-a.js";
import { handleStreamB } from "./stream-b.js";

export function mountStreamRoutes(router: Router): void {
  router.post("/api/stream", async (ctx: Context, _next: Next) => {
    const body = parseStreamBody(ctx);
    if (!body) return;
    const llm = requireProviderLlm(ctx, body.provider);
    if (!llm) return;
    // 通过闸门之后才改成原始 res：400/没 Key 仍走 koa JSON，页面能读到 HTTP 状态码
    ctx.respond = false;
    if (body.protocol === "A") {
      await handleStreamA(llm, body, ctx.res);
    } else {
      await handleStreamB(llm, body, ctx.res);
    }
  });
}
