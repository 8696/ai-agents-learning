/**
 * 职责：真 API 端点 —— GET /api/real（单次）+ GET /api/real-burst（并发撞 429）。
 * 数据流：requireLlm → handleReal / handleRealBurst → ctx.body。
 * 本页教学点在 pages/real.html；无 Key 时 503（页面按钮应已 disabled）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { requireLlm, readConcurrency } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { handleReal, handleRealBurst } from "../lib/flow/run-with-retry.js";

export function mountRealRoutes(router: Router): void {
  router.get("/api/real", async (ctx: Context) => {
    if (!requireLlm(ctx)) return;
    try {
      ctx.body = await handleReal();
    } catch (err: unknown) {
      writeUpstreamError(ctx, err, { mode: "real" });
    }
  });

  router.get("/api/real-burst", async (ctx: Context) => {
    if (!requireLlm(ctx)) return;
    const concurrency = readConcurrency(ctx);
    try {
      ctx.body = await handleRealBurst(concurrency);
    } catch (err: unknown) {
      writeUpstreamError(ctx, err, { mode: "real-burst" });
    }
  });
}
