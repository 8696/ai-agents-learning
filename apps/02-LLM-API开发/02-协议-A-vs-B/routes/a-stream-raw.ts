/**
 * 职责：POST /api/a-stream-raw —— 协议 A 流式 + kind 分类（页面三栏着色）。
 * 数据流：闸门 → streamOnceAClassified → { type:"openai_chunk", kind, chunk }。
 * 本文件只调 protocol-a，禁止 import protocol-b。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { beginSseCall } from "../lib/http/request-guards.js";
import { writeSseOrJsonError } from "../lib/http/write-upstream-error.js";
import { streamOnceAClassified } from "../lib/protocol-a/send-stream-raw.js";

export function mountAStreamRawRoutes(router: Router): void {
  router.post("/api/a-stream-raw", async (ctx: Context) => {
    const started = beginSseCall(ctx);
    if (!started) return;
    try {
      await streamOnceAClassified(started.client, started.body, ctx.res);
    } catch (err: unknown) {
      writeSseOrJsonError(ctx.res, err);
    }
  });
}
