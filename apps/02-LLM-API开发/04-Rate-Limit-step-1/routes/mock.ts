/**
 * 职责：mock 端点 —— 5 个直接路径 + /api/drop（掐连接）+ /api/proxy（套 retry）。
 * 数据流：query.target → readProxyTarget → handleProxy → ctx.body；直接路径走 applyDirect。
 * 本页教学点在 pages/mock.html；不需要 Key。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handleGetMock 入口封装层，proxy 走 run-with-retry）；
 *   校验挡下单独写 info 拒绝；子调用 run-with-retry / handleDirect 内部已自带五条日志。
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
      const tHandlerStart = Date.now();
      logger.info(
        `api.mock.${name}`,
        "调用函数开始：handleGetMockDirect",
        `为什么写这条日志：直接路径不走 retry；记 name 让 mock.respond 对得上。`,
        {
          入参: { name },
          __code: `applyDirect(ctx, \`/api/${name}\`);`,
        },
      );
      applyDirect(ctx, `/api/${name}`);
      logger.info(
        `api.mock.${name}`,
        "调用函数结束：handleGetMockDirect",
        "为什么写这条日志：route 要把 mock 直接响应写给客户端；返回 status + content-type 便于核对。当前：applyDirect 已写 ctx.body。",
        {
          返回值: { status: ctx.status, contentType: ctx.response.get("content-type") ?? null },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    });
  }

  // 掐掉 socket，让外层 fetch 抛错 → retry 记 status=network（可重试，直到耗尽）
  router.get("/api/drop", (ctx: Context) => {
    logger.info(
      "api.mock.drop",
      "调用函数开始：handleGetMockDrop",
      "为什么写这条日志：掐掉 socket，让 fetch 抛 ECONNRESET → retry 落 status=network；记 reason 便于事后核对 retry 时间线的 network 项。当前：即将 destroy res。",
      { __code: `ctx.respond = false; ctx.res.destroy();` },
    );
    ctx.respond = false;
    ctx.res.destroy();
  });

  router.get("/api/proxy", async (ctx: Context, _next: Next) => {
    const target = readProxyTarget(ctx);
    if (!target) return;
    const tHandlerStart = Date.now();
    logger.info(
      "api.mock.proxy",
      "调用函数开始：handleGetProxy",
      "为什么写这条日志：route 只认这一层返回的 ProxyResult；里面 handleProxy 是真正干活的那一层（retry 套 mock）。当前：proxy 入口；后续 handleProxy 会再打 proxy.start。",
      {
        入参: { target, queryRaw: ctx.query },
        __code: `const out = await handleProxy(target);\nctx.body = out.body;`,
      },
    );
    const out = await handleProxy(target);
    ctx.status = out.status;
    ctx.body = out.body;
    logger.info(
      "api.mock.proxy",
      "调用函数结束：handleGetProxy",
      "为什么写这条日志：route 要把 ProxyResult 写进 ctx.body 交给页面；记 ok / attempts 长度 / lastStatus 便于核对 retry 时间线。当前：handleProxy 已返回。",
      {
        返回值: {
          status: out.status,
          ok: out.body.ok,
          attemptsCount: "attempts" in out.body ? out.body.attempts.length : null,
          lastStatus: "attempts" in out.body && out.body.attempts.length > 0 ? out.body.attempts.at(-1)?.status : null,
        },
        耗时ms: Date.now() - tHandlerStart,
      },
    );
  });
}