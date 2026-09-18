/**
 * 职责：POST /api/mcp/kb/prompts-list。kb server 的 prompts/list。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { exchangeMcp } from "../lib/flow/exchange.js";
import { pickHostId } from "../lib/http/mcp-context.js";

export function mountKbPromptsList(router: Router): void {
  router.post("/api/mcp/kb/prompts-list", (ctx: Context) => {
    ctx.body = exchangeMcp("prompts/list", {
      serverId: "kb",
      hostId: pickHostId(ctx),
    });
  });
}