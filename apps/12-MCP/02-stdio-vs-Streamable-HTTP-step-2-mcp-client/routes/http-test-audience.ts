/**
 * 职责：POST /api/http/test-audience —— 「用发给别的 MCP server 的 token 试一次」演示入口。
 *
 * 数据流：
 *   页面点「用「发给别的 MCP server 的 token」试一次」
 *     → fetch("/api/http/test-audience")
 *       → 本路由
 *         → 用 raw fetch POST 远端 Server demo 的 /mcp
 *           headers: Authorization: Bearer "token-for-other-server"
 *           body: { jsonrpc: "2.0", id: 1, method: "tools/list" }
 *         → 远端 route checkBearer → reason: "wrong_audience"
 *         → 远端返 401 + WWW-Authenticate: Bearer realm="mcp", error="invalid_token", error_description="audience mismatch: ..."
 *         → 抓 header + body 透传回 page
 *
 * 关键：不能用 mcp-http-client.ts（动态 fetch 走 ALS，token 由浏览器决定）——
 *       这里要硬编码「错的 token」发出去，看服务端 audience 不匹配时的反应。
 *       所以走原生 fetch 直接对远端 Server demo 发 POST。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";

/**
 * 硬编码的「错 audience 的 token」—— 服务端 TOKEN_TO_USER 表里有这一项，audience = "other-mcp"。
 */
const CROSS_SERVER_TOKEN = "token-for-other-server";

/**
 * 远端 Server demo 的 URL。本 demo 里和当前 client demo 一起启动时通常是 http://127.0.0.1:50134/mcp。
 * 用 env SERVER_URL 覆盖（测试时连远程 server 时有用）。注意：env 默认值包含 /mcp 后缀，
 * 跟 lib/flow/mcp-http-client.ts 的 SERVER_URL 约定一致。
 */
const SERVER_URL = process.env.SERVER_URL ?? "http://127.0.0.1:50134/mcp";

export function mountHttpTestAudience(router: Router): void {
  router.post("/api/http/test-audience", async (ctx: Context) => {
    const t0 = Date.now();
    logger.info(
      "│ 调用函数-testAudience",
      "调用函数开始：testAudience",
      "为什么写这条日志：演示 OAuth 2.1 audience 校验——把发给别的 MCP server 的 token 拿来用，服务端必须 401 + WWW-Authenticate 拒绝。当前：浏览器点了「用「发给别的 MCP server 的 token」试一次」。",
      {
        入参: { token: `${CROSS_SERVER_TOKEN.slice(0, 4)}***（发往 ${SERVER_URL}/mcp）` },
        __code: "const res = await fetch(SERVER_URL + '/mcp', { method: 'POST', headers: { Authorization: `Bearer ${CROSS_SERVER_TOKEN}` }, body: ... });",
      },
    );

    try {
      const res = await fetch(SERVER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${CROSS_SERVER_TOKEN}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      });
      const elapsed = Date.now() - t0;

      // 401 响应是 application/json；200 响应是 text/event-stream（拿不到 body）
      const contentType = res.headers.get("content-type") ?? "";
      const bodyObj: Record<string, unknown> | null =
        contentType.includes("application/json")
          ? ((await res.json().catch(() => null)) as Record<string, unknown> | null)
          : null;
      const bodyJson = bodyObj as null | { reason?: string; error_description?: string };
      const bodyText = contentType.includes("application/json")
        ? null
        : await res.text().catch(() => null);

      const wwwAuthenticate = res.headers.get("www-authenticate");
      const { ok: httpOk, ...rest } = {
        httpStatus: res.status,
        ok: res.ok,
        body: bodyJson ?? bodyText,
        reason: bodyJson && bodyJson.reason,
        error_description: bodyJson && bodyJson.error_description,
        wwwAuthenticate,
        elapsedMs: elapsed,
      };

      logger.info(
        "│ 调用函数-testAudience",
        "调用函数结束：testAudience",
        "为什么写这条日志：把远端的完整响应（httpStatus + body + WWW-Authenticate header）透传给 page，page 直接展示 OAuth 2.1 401 标准形状。当前：演示结束。",
        { 返回值: rest, 耗时ms: Date.now() - t0 },
      );

      ctx.body = { ok: true, ...rest };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.info(
        "│ 调用函数-testAudience",
        "调用函数结束：testAudience（失败）",
        "为什么写这条日志：远端可能没起、或网络问题。当前：本机 fetch 抛错。",
        { 返回值: { error: message }, 耗时ms: Date.now() - t0 },
      );
      ctx.body = { ok: false, error: message };
    }
  });
}