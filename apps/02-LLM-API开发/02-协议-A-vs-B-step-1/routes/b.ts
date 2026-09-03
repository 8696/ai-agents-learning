/**
 * 职责：POST /api/b —— 协议 B 流式（text 增量 + 末帧 usage，给 curl 用）。
 * 数据流：闸门 → streamOnceBText → content_block_delta / message_stop。
 * 本文件只调 protocol-b，禁止 import protocol-a。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { beginSseCall } from "../lib/http/request-guards.js";
import { writeSseOrJsonError } from "../lib/http/write-upstream-error.js";
import { streamOnceBText } from "../lib/protocol-b/send-stream.js";

export function mountBRoutes(router: Router): void {
  router.post("/api/b", async (ctx: Context) => {
    const started = beginSseCall(ctx);
    if (!started) return;
    try {
      await streamOnceBText(started.client, started.body, ctx.res);
    } catch (err: unknown) {
      writeSseOrJsonError(ctx.res, err);
    }
  });
}
