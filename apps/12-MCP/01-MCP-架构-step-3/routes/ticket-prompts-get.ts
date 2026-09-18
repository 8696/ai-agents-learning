/**
 * 职责：POST /api/mcp/ticket/prompts-get。ticket server 不承认 prompts——返回 -32601。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { exchangeMcp } from "../lib/flow/exchange.js";
import { pickHostId } from "../lib/http/mcp-context.js";

export function mountTicketPromptsGet(router: Router): void {
  router.post("/api/mcp/ticket/prompts-get", (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name : "";
    const args = (typeof body.arguments === "object" && body.arguments && !Array.isArray(body.arguments))
      ? (body.arguments as Record<string, string>)
      : {};
    ctx.body = exchangeMcp("prompts/get", {
      serverId: "ticket",
      hostId: pickHostId(ctx),
      params: { name, arguments: args },
    });
  });
}