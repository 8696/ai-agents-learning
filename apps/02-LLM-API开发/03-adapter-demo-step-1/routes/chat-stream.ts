/**
 * 职责：POST /api/chat-stream —— SSE 推 UnifiedDelta（薄：闸门 → 开流 → adapter）。
 * 数据流：opts → sendMessageStream → data: {type:thinking|content|usage|done} → [DONE]。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { readChatBody, requireLlm } from "../lib/http/request-guards.js";
import { openSseStream } from "../lib/http/sse-writer.js";
import { sendMessageStream } from "../lib/adapter/send-message.js";

function writeRawJson(res: Context["res"], status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export function mountChatStreamRoutes(router: Router): void {
  router.post("/api/chat-stream", async (ctx: Context) => {
    ctx.respond = false;

    const parsed = readChatBody(ctx);
    if (!parsed) {
      writeRawJson(ctx.res, ctx.status || 400, ctx.body);
      return;
    }
    const client = requireLlm(ctx);
    if (!client) {
      writeRawJson(ctx.res, ctx.status || 503, ctx.body);
      return;
    }

    const writer = openSseStream(ctx.res);
    try {
      for await (const delta of sendMessageStream(client, parsed)) {
        if (writer.isClosed()) break;
        writer.frame(delta);
      }
      writer.done();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      writer.frame({ type: "_error", error: msg });
      writer.done();
    }
  });
}
