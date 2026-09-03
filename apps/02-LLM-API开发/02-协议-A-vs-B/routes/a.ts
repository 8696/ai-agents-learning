/**
 * 职责：POST /api/a —— 协议 A 流式（openai chunk 原样 SSE，给 curl 用）。
 * 数据流：闸门 → streamOnceARawChunks → data: {choices...} → [DONE]。
 * 本文件只调 protocol-a，禁止 import protocol-b。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { beginSseCall } from "../lib/http/request-guards.js";
import { writeSseOrJsonError } from "../lib/http/write-upstream-error.js";
import { streamOnceARawChunks } from "../lib/protocol-a/send-stream.js";

export function mountARoutes(router: Router): void {
  router.post("/api/a", async (ctx: Context) => {
    const started = beginSseCall(ctx);
    if (!started) return;
    try {
      await streamOnceARawChunks(started.client, started.body, ctx.res);
    } catch (err: unknown) {
      writeSseOrJsonError(ctx.res, err);
    }
  });
}
