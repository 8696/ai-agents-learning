/**
 * 职责：POST /mcp —— MCP 协议端点，走 koa 路由（同进程同端口）。
 * 数据流：bodyParser 解析 JSON body → transport.handleRequest(req, res, body)
 *
 * 关键：ctx.respond = false —— koa 默认会在 handler 返回后自己写 response，
 * 但 MCP 的 SSE 响应要一直写到 stream 结束。让 koa 别插手，由 transport 直接管整个响应。
 *
 * 为什么单独成文件：MCP 协议端点是这个 demo 的核心业务 URL（一个业务 URL 一个 route 文件）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { transport } from "../lib/flow/mcp-http-server.js";

export function mountMcpEndpoint(router: Router): void {
  router.post("/mcp", async (ctx: Context) => {
    // 让 koa 不要写自己的 response，由 transport 直接写
    ctx.respond = false;

    const body = ctx.request.body;
    try {
      await transport.handleRequest(ctx.req, ctx.res, body);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // transport 已经写了部分响应（headers 已发），这里只是 console 兜底
      // eslint-disable-next-line no-console
      console.error("[mcp-endpoint] handleRequest 抛错：", message);
    }
  });
}