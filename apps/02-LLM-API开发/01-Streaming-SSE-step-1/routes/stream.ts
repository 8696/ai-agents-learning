/**
 * 职责：GET /api/stream —— 模拟 SSE（薄封装：故意 400 → 开流 → 交给 flow）。
 *
 * 数据流：
 *   浏览器 GET /api/stream
 *     → ?fail=1 时 400 JSON（教学用，不推帧）
 *     → 否则每 200ms 一帧 TOKENS，结束 [DONE]
 *
 * 为什么单独成文件：这是三条业务路里「不调模型」的那条流式路，和 blocking / real 生命周期不同。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { isIntentionalFail, writeRawJson } from "../lib/http/request-guards.js";
import { pumpSimulatedSse } from "../lib/flow/simulate.js";
import { openSseStream } from "../lib/sse/sse-writer.js";

export function mountStreamRoutes(router: Router): void {
  router.get("/api/stream", async (ctx: Context) => {
    // ① 接管响应：SSE 要手写 res，koa 的 ctx.body 从这行起就不生效了（§5.3.5）
    ctx.respond = false;

    // ② 故意 400 必须排在开流之前：头一旦是 text/event-stream，就改不回 400 了
    if (isIntentionalFail(ctx)) {
      writeRawJson(ctx.res, 400, {
        error: "故意触发的参数错误（query fail=1）。模拟流本身不需要 Key。",
      });
      return;
    }

    const writer = openSseStream(ctx.res);
    await pumpSimulatedSse(writer);
  });
}
