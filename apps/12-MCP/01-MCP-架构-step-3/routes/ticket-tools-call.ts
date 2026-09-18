/**
 * 职责：POST /api/mcp/ticket/tools-call。ticket server 的 tools/call。
 *
 * ticket server 只承认 make_latte + create_ticket；其他工具名走 JSON-RPC -32602 错误。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { exchangeMcp } from "../lib/flow/exchange.js";
import { pickHostId } from "../lib/http/mcp-context.js";

export function mountTicketToolsCall(router: Router): void {
  router.post("/api/mcp/ticket/tools-call", (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name : "";
    const args = (typeof body.arguments === "object" && body.arguments && !Array.isArray(body.arguments))
      ? (body.arguments as Record<string, unknown>)
      : {};
    ctx.body = exchangeMcp("tools/call", {
      serverId: "ticket",
      hostId: pickHostId(ctx),
      params: { name, arguments: args as never },
    });
  });
}