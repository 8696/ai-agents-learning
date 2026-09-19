/**
 * 职责：POST /mcp —— MCP 协议端点，走 koa 路由（同进程同端口）。
 * 数据流：bodyParser 解析 JSON body → 先 checkBearer → 不通过 401 → 通过才 transport.handleRequest(req, res, body)
 *
 * 关键：ctx.respond = false —— koa 默认会在 handler 返回后自己写 response，
 * 但 MCP 的 SSE 响应要一直写到 stream 结束。让 koa 别插手，由 transport 直接管整个响应。
 *
 * 为什么单独成文件：MCP 协议端点是这个 demo 的核心业务 URL（一个业务 URL 一个 route 文件）。
 * 鉴权放在 transport 之前才保证「401 在 JSON-RPC 之前」的语义。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { transport } from "../lib/flow/mcp-http-server.js";
import { checkBearer } from "../lib/flow/auth.js";
import { runWithUser } from "../lib/flow/request-context.js";

export function mountMcpEndpoint(router: Router): void {
  router.post("/mcp", async (ctx: Context) => {
    // 让 koa 不要写自己的 response，由 transport / auth 自己写
    ctx.respond = false;

    // ── 第一关：HTTP 鉴权（管子上的身份）──
    // 不通过 → 直接 401，不进 transport / 不进 JSON-RPC
    const auth = checkBearer(ctx.req.headers);
    if (!auth.ok) {
      const body = JSON.stringify({
        ok: false,
        error: "HTTP 401 · Authorization 头无效或缺失",
        reason: auth.reason,
      });
      ctx.res.writeHead(401, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body, "utf8"),
        "WWW-Authenticate": 'Bearer realm="mcp"',
      });
      ctx.res.end(body);
      return;
    }

    // ── 第二关：进 JSON-RPC（数据层）──
    // 用 AsyncLocalStorage 把 userId 传到 Tool / Resource / Prompt handler
    const body = ctx.request.body;
    try {
      await runWithUser(auth.userId, () => transport.handleRequest(ctx.req, ctx.res, body));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // transport 已经写了部分响应（headers 已发），这里只是 console 兜底
      // eslint-disable-next-line no-console
      console.error("[mcp-endpoint] handleRequest 抛错：", message);
    }
  });
}
