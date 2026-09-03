/**
 * 职责：POST /api/chat —— 一次性 unified 响应（薄：闸门 → adapter.sendMessage）。
 * 数据流：{ message, protocol, … } → UnifiedResponse JSON。
 * 本页教学点在 public/pages/once.html：业务层看不见 SDK。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { readChatBody, requireLlm } from "../lib/http/request-guards.js";
import { sendMessage } from "../lib/adapter/send-message.js";

export function mountChatRoutes(router: Router): void {
  router.post("/api/chat", async (ctx: Context) => {
    const client = requireLlm(ctx);
    if (!client) return;
    const opts = readChatBody(ctx);
    if (!opts) return;

    try {
      ctx.body = await sendMessage(client, opts);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.status = 500;
      ctx.body = { error: msg };
    }
  });
}
