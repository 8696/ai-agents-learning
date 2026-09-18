/**
 * 职责：POST /api/mcp/kb/tools-call。kb server 不承认 tools——返回 -32601。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { exchangeMcp } from "../lib/flow/exchange.js";
import { pickHostId } from "../lib/http/mcp-context.js";

export function mountKbToolsCall(router: Router): void {
  router.post("/api/mcp/kb/tools-call", (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name : "";
    const args = (typeof body.arguments === "object" && body.arguments && !Array.isArray(body.arguments))
      ? (body.arguments as Record<string, unknown>)
      : {};
    ctx.body = exchangeMcp("tools/call", {
      serverId: "kb",
      hostId: pickHostId(ctx),
      params: { name, arguments: args as never },
    });
  });
}