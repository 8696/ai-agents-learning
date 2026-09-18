/**
 * 职责：POST /api/mcp/kb/resources-list。kb server 的 resources/list。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { exchangeMcp } from "../lib/flow/exchange.js";
import { pickHostId } from "../lib/http/mcp-context.js";

export function mountKbResourcesList(router: Router): void {
  router.post("/api/mcp/kb/resources-list", (ctx: Context) => {
    ctx.body = exchangeMcp("resources/list", {
      serverId: "kb",
      hostId: pickHostId(ctx),
    });
  });
}