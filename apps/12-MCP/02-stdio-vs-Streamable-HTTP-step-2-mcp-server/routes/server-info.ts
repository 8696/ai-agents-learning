/**
 * 职责：GET /api/server-info —— 给前端状态页用。
 * 数据流：getServerInfo() + getKnownUsers() → ctx.body
 *
 * 教学 demo：knownUsers 只回 token 前 4 字符 + 长度，不回明文；生产严禁这样做。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { getServerInfo } from "../lib/flow/mcp-http-server.js";
import { getKnownUsers } from "../lib/flow/auth.js";

export function mountServerInfo(router: Router): void {
  router.get("/api/server-info", (ctx: Context) => {
    const info = getServerInfo();
    ctx.body = {
      ok: true,
      ...info,
      authRequired: true,
      knownUsers: getKnownUsers(),
    };
  });
}
