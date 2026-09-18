/**
 * 职责：POST /api/mcp/ticket/initialize。ticket server 的 initialize。
 *
 * hostId 来自 header X-MCP-Host-Id；clientInfo 来自 body（前端可显式传）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { exchangeMcp } from "../lib/flow/exchange.js";
import { pickHostId, pickClientInfo } from "../lib/http/mcp-context.js";

export function mountTicketInitialize(router: Router): void {
  router.post("/api/mcp/ticket/initialize", (ctx: Context) => {
    ctx.body = exchangeMcp("initialize", {
      serverId: "ticket",
      hostId: pickHostId(ctx),
      clientInfoOverride: pickClientInfo(ctx),
    });
  });
}