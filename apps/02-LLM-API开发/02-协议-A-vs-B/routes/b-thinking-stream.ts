/**
 * 职责：POST /api/b-thinking-stream —— 协议 B 流式 + 启用 thinking（完整事件流）。
 * 数据流：闸门 → streamOnceBThinkingEvents → 原始 Anthropic 事件原样转发。
 * 本文件只调 protocol-b，禁止 import protocol-a。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { beginSseCall } from "../lib/http/request-guards.js";
import { writeSseOrJsonError } from "../lib/http/write-upstream-error.js";
import { streamOnceBThinkingEvents } from "../lib/protocol-b/send-thinking-stream.js";

export function mountBThinkingStreamRoutes(router: Router): void {
  router.post("/api/b-thinking-stream", async (ctx: Context) => {
    const started = beginSseCall(ctx);
    if (!started) return;
    try {
      await streamOnceBThinkingEvents(started.client, started.body, ctx.res);
    } catch (err: unknown) {
      writeSseOrJsonError(ctx.res, err);
    }
  });
}
