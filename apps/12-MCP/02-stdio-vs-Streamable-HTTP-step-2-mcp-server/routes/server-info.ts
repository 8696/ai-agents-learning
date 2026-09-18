/**
 * 职责：GET /api/server-info —— 给前端状态页用。
 * 数据流：getServerInfo() → ctx.body
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { getServerInfo } from "../lib/flow/mcp-http-server.js";

export function mountServerInfo(router: Router): void {
  router.get("/api/server-info", (ctx: Context) => {
    ctx.body = { ok: true, ...getServerInfo() };
  });
}