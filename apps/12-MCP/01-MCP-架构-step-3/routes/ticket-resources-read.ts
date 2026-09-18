/**
 * 职责：POST /api/mcp/ticket/resources-read。ticket server 不承认 resources——返回 -32601。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { exchangeMcp } from "../lib/flow/exchange.js";
import { pickHostId } from "../lib/http/mcp-context.js";

export function mountTicketResourcesRead(router: Router): void {
  router.post("/api/mcp/ticket/resources-read", (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const uri = typeof body.uri === "string" ? body.uri : "";
    ctx.body = exchangeMcp("resources/read", {
      serverId: "ticket",
      hostId: pickHostId(ctx),
      params: { uri },
    });
  });
}