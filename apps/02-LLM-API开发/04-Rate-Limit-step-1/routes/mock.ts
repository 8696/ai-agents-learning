/**
 * 职责：mock 端点 —— 5 个直接路径 + /api/drop（掐连接）+ /api/proxy（套 retry）。
 * 数据流：query.target → readProxyTarget → handleProxy → ctx.body；直接路径走 applyDirect。
 * 本页教学点在 pages/mock.html；不需要 Key。
 *
 * 日志（§5.3.16）：proxy 入口打 mock-proxy.entry；直接路径每个请求打 mock.direct.{name} 便于看哪些场景被点过。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { readProxyTarget } from "../lib/http/request-guards.js";
import { applyDirect } from "../lib/mock/mock-responses.js";
import { handleProxy } from "../lib/flow/run-with-retry.js";
import { logger } from "../lib/logger.js";

export function mountMockRoutes(router: Router): void {
  for (const name of ["easy", "chaos", "auth", "forever", "ok"] as const) {
    router.get(`/api/${name}`, (ctx: Context) => {
      logger.debug(`mock.direct.${name}`, `GET /api/${name}`, "直接路径不走 retry；记 name 让 mock.respond 对得上", { name });
      applyDirect(ctx, `/api/${name}`);
    });
  }

  // 掐掉 socket，让外层 fetch 抛错 → retry 记 status=network（可重试，直到耗尽）
  router.get("/api/drop", (ctx: Context) => {
    logger.debug("mock.direct.drop", "GET /api/drop", "掐掉 socket，让 fetch 抛 ECONNRESET → retry 落 status=network", {});
    ctx.respond = false;
    ctx.res.destroy();
  });

  router.get("/api/proxy", async (ctx: Context, _next: Next) => {
    const target = readProxyTarget(ctx);
    if (!target) return;
    logger.info("mock-proxy.entry", `GET /api/proxy target=${target}`, "proxy 入口；后续 handleProxy 会再打 proxy.start", { target });
    const out = await handleProxy(target);
    ctx.status = out.status;
    ctx.body = out.body;
  });
}
