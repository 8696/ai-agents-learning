/**
 * 职责：真 API 端点 —— GET /api/real（单次）+ GET /api/real-burst（并发撞 429）。
 * 数据流：requireLlm → handleReal / handleRealBurst → ctx.body。
 * 本页教学点在 pages/real.html；无 Key 时 503（页面按钮应已 disabled）。
 *
 * 日志（§5.3.16）：路由进入打一次 real.entry / real-burst.entry，便于把页面点击和 handleReal/handleRealBurst 内部时间线串起来。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm, readConcurrency } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { handleReal, handleRealBurst } from "../lib/flow/run-with-retry.js";
import { logger } from "../lib/logger.js";

export function mountRealRoutes(router: Router): void {
  router.get("/api/real", async (ctx: Context) => {
    logger.info("real.entry", "GET /api/real", "路由层入口；记 provider 让翻日志时直接知道走的是哪一家", {
      provider: requireLlm(ctx)?.provider ?? null,
    });
    if (!requireLlm(ctx)) return;
    try {
      ctx.body = await handleReal();
    } catch (err: unknown) {
      writeUpstreamError(ctx, err, { mode: "real" });
    }
  });

  router.get("/api/real-burst", async (ctx: Context) => {
    const concurrency = readConcurrency(ctx);
    logger.info("real-burst.entry", "GET /api/real-burst", "并发撞 429 入口；记 concurrency 便于对照 burst aggregate", {
      concurrency,
      provider: requireLlm(ctx)?.provider ?? null,
    });
    if (!requireLlm(ctx)) return;
    try {
      ctx.body = await handleRealBurst(concurrency);
    } catch (err: unknown) {
      writeUpstreamError(ctx, err, { mode: "real-burst" });
    }
  });
}
