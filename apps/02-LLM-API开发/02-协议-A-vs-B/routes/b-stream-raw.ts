/**
 * 职责：POST /api/b-stream-raw —— 协议 B 流式、不启用 thinking（包一层 anthropic_event）。
 * 数据流：闸门 → streamOnceBRawEvents → { type:"anthropic_event", eventIdx, event }。
 * 本文件只调 protocol-b，禁止 import protocol-a。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { beginSseCall } from "../lib/http/request-guards.js";
import { writeSseOrJsonError } from "../lib/http/write-upstream-error.js";
import { streamOnceBRawEvents } from "../lib/protocol-b/send-stream-raw.js";

export function mountBStreamRawRoutes(router: Router): void {
  router.post("/api/b-stream-raw", async (ctx: Context) => {
    const started = beginSseCall(ctx);
    if (!started) return;
    try {
      await streamOnceBRawEvents(started.client, started.body, ctx.res);
    } catch (err: unknown) {
      writeSseOrJsonError(ctx.res, err);
    }
  });
}
