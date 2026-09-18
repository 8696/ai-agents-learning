/**
 * 职责：POST /api/mcp/ticket/resources-list。ticket server 不承认 resources——返回 -32601。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { exchangeMcp } from "../lib/flow/exchange.js";
import { pickHostId } from "../lib/http/mcp-context.js";

export function mountTicketResourcesList(router: Router): void {
  router.post("/api/mcp/ticket/resources-list", (ctx: Context) => {
    ctx.body = exchangeMcp("resources/list", {
      serverId: "ticket",
      hostId: pickHostId(ctx),
    });
  });
}