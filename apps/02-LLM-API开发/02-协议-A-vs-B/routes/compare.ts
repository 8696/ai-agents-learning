/**
 * 职责：POST /api/compare —— 同 prompt 一次性并排（分叉在本 route：各调各的 SDK 函数）。
 * 数据流：sendOnceA ∥ sendOnceB → shapeComparePair → { a, b }。
 * 禁止在 protocol-* 里 if (protocol==="b")；本文件只编排，不碰 SDK 字段。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { performance } from "node:perf_hooks";
import { shapeComparePair } from "../lib/compare/shape-once.js";
import { readCallBody, requireLlm } from "../lib/http/request-guards.js";
import { writeUpstreamError } from "../lib/http/write-upstream-error.js";
import { sendOnceA } from "../lib/protocol-a/send-once.js";
import { sendOnceB } from "../lib/protocol-b/send-once.js";

export function mountCompareRoutes(router: Router): void {
  router.post("/api/compare", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;
    const body = readCallBody(ctx);
    if (!body) return;

    console.log(
      `\n[${(performance.now() / 1000).toFixed(2)}s] /api/compare: 开始同 prompt 跑 A 和 B`,
    );

    try {
      const [aSettled, bSettled] = await Promise.allSettled([
        sendOnceA(client, body, body.enableThinking),
        sendOnceB(client, body, null),
      ]);
      ctx.status = 200;
      ctx.type = "application/json; charset=utf-8";
      ctx.body = JSON.stringify(shapeComparePair(aSettled, bSettled), null, 2);
      console.log(`[${(performance.now() / 1000).toFixed(2)}s] /api/compare: 完成`);
    } catch (err: unknown) {
      writeUpstreamError(ctx, err);
    }
  });
}
