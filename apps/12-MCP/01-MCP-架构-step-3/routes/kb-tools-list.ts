/**
 * 职责：POST /api/mcp/kb/tools-list。kb server 不承认 tools——返回 -32601（演示一对一专线 + 服务端拒绝跨线 method）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { exchangeMcp } from "../lib/flow/exchange.js";
import { pickHostId } from "../lib/http/mcp-context.js";

export function mountKbToolsList(router: Router): void {
  router.post("/api/mcp/kb/tools-list", (ctx: Context) => {
    ctx.body = exchangeMcp("tools/list", {
      serverId: "kb",
      hostId: pickHostId(ctx),
    });
  });
}