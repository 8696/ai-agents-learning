/**
 * 职责：mock 端点 —— 5 个直接路径 + /api/drop（掐连接）+ /api/proxy（套 retry）。
 * 数据流：query.target → readProxyTarget → handleProxy → ctx.body；直接路径走 applyDirect。
 * 本页教学点在 pages/mock.html；不需要 Key。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { readProxyTarget } from "../lib/http/request-guards.js";
import { applyDirect } from "../lib/mock/mock-responses.js";
import { handleProxy } from "../lib/flow/run-with-retry.js";

export function mountMockRoutes(router: Router): void {
  for (const name of ["easy", "chaos", "auth", "forever", "ok"] as const) {
    router.get(`/api/${name}`, (ctx: Context) => {
      applyDirect(ctx, `/api/${name}`);
    });
  }

  // 掐掉 socket，让外层 fetch 抛错 → retry 记 status=network（可重试，直到耗尽）
  router.get("/api/drop", (ctx: Context) => {
    ctx.respond = false;
    ctx.res.destroy();
  });

  router.get("/api/proxy", async (ctx: Context, _next: Next) => {
    const target = readProxyTarget(ctx);
    if (!target) return;
    const out = await handleProxy(target);
    ctx.status = out.status;
    ctx.body = out.body;
  });
}
