/**
 * 职责：GET /api/server-info —— 给前端状态页用。
 * 数据流：getServerInfo() + getKnownUsers() + SERVER_REALM → ctx.body
 *
 * 教学 demo：knownUsers 只回 token 前 4 字符 + 长度，不回明文；生产严禁这样做。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { getServerInfo } from "../lib/flow/mcp-http-server.js";
import { getKnownUsers, SERVER_REALM } from "../lib/flow/auth.js";

export function mountServerInfo(router: Router): void {
  router.get("/api/server-info", (ctx: Context) => {
    const info = getServerInfo();
    ctx.body = {
      ok: true,
      ...info,
      authRequired: true,
      knownUsers: getKnownUsers(),
      oauth: {
        spec: "OAuth 2.1 (RFC 6749 + RFC 9728)",
        protectedResource: {
          realm: SERVER_REALM,
          audience: SERVER_REALM,
        },
        roles: [
          "user (Resource Owner) —— token 的实际持有人",
          "Authorization Server (概念上) —— 颁发 access token 的服务；本 demo 未实现",
          "MCP Client —— 把 access token 放进 Authorization 头转发给 Resource Server",
          "MCP Server (Resource Server) —— 本 server；验 authority；保护资源",
        ],
      },
    };
  });
}