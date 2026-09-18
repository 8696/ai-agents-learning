/**
 * 职责：POST /api/mcp/ticket/tools-list。ticket server 的 tools/list。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { exchangeMcp } from "../lib/flow/exchange.js";
import { pickHostId } from "../lib/http/mcp-context.js";

export function mountTicketToolsList(router: Router): void {
  router.post("/api/mcp/ticket/tools-list", (ctx: Context) => {
    ctx.body = exchangeMcp("tools/list", {
      serverId: "ticket",
      hostId: pickHostId(ctx),
    });
  });
}