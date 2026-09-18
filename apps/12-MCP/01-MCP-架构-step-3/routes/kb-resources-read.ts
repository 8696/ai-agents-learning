/**
 * 职责：POST /api/mcp/kb/resources-read。kb server 的 resources/read。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { exchangeMcp } from "../lib/flow/exchange.js";
import { pickHostId } from "../lib/http/mcp-context.js";

export function mountKbResourcesRead(router: Router): void {
  router.post("/api/mcp/kb/resources-read", (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    const uri = typeof body.uri === "string" ? body.uri : "";
    ctx.body = exchangeMcp("resources/read", {
      serverId: "kb",
      hostId: pickHostId(ctx),
      params: { uri },
    });
  });
}