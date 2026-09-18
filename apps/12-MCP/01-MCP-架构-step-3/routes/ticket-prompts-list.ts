/**
 * 职责：POST /api/mcp/ticket/prompts-list。ticket server 不承认 prompts——返回 -32601。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { exchangeMcp } from "../lib/flow/exchange.js";
import { pickHostId } from "../lib/http/mcp-context.js";

export function mountTicketPromptsList(router: Router): void {
  router.post("/api/mcp/ticket/prompts-list", (ctx: Context) => {
    ctx.body = exchangeMcp("prompts/list", {
      serverId: "ticket",
      hostId: pickHostId(ctx),
    });
  });
}