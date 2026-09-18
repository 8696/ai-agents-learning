/**
 * 职责：POST /api/mcp/kb/initialize。kb server 的 initialize。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { exchangeMcp } from "../lib/flow/exchange.js";
import { pickHostId, pickClientInfo } from "../lib/http/mcp-context.js";

export function mountKbInitialize(router: Router): void {
  router.post("/api/mcp/kb/initialize", (ctx: Context) => {
    ctx.body = exchangeMcp("initialize", {
      serverId: "kb",
      hostId: pickHostId(ctx),
      clientInfoOverride: pickClientInfo(ctx),
    });
  });
}