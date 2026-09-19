/**
 * 职责：POST /api/http/test-401 —— 「无 token / 错 token → 401」演示入口（A5 页面可观察）。
 *
 * 数据流：
 *   页面点「无 token 试一次」或「错 token 试一次」
 *     → fetch("/api/http/test-401", { body: { scenario: "missing" | "wrong" } })
 *       → 本路由
 *         → 用原生 fetch POST 远端 Server demo 的 /mcp
 *           headers:
 *             missing → 不带 Authorization 头
 *             wrong   → Authorization: Bearer wrong-token-demo
 *           body: { jsonrpc: "2.0", id: 1, method: "tools/list" }
 *         → 远端 route checkBearer 返 401 + WWW-Authenticate
 *         → 抓 header + body 透传回 page
 *
 * 关键：不能用 mcp-http-client.ts 的 SDK 转发（SDK 抛 401 时上层会兜 500）——
 *       这里走原生 fetch 直发 /mcp，让外层 HTTP 状态码真实是 401 而不是 500。
 *       同 routes/http-test-audience.ts 的模式。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { logger } from "../lib/logger.js";

/** 远端 Server demo 的 URL（约定：包含 /mcp 后缀） */
const SERVER_URL = process.env.SERVER_URL ?? "http://127.0.0.1:50134/mcp";

const Body = z.object({
  scenario: z.enum(["missing", "wrong"]),
});

export function mountHttpTest401(router: Router): void {
  router.post("/api/http/test-401", async (ctx: Context) => {
    const t0 = Date.now();
    const parsed = Body.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "scenario 必须是 'missing' 或 'wrong'", issues: parsed.error.issues };
      return;
    }
    const scenario = parsed.data.scenario;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (scenario === "wrong") {
      headers.Authorization = "Bearer wrong-token-demo";
    }

    logger.info(
      "│ 调用函数-test401",
      "调用函数开始：test401",
      "为什么写这条日志：A5 演示入口——浏览器侧手动触发服务端鉴权失败，看 HTTP 401 + WWW-Authenticate + 中文 error_description。当前：浏览器点了「无 token / 错 token」按钮。",
      {
        入参: { scenario, hasAuthHeader: Boolean(headers.Authorization) },
        __code: "const res = await fetch(SERVER_URL, { method: 'POST', headers, body: ... });",
      },
    );

    try {
      const res = await fetch(SERVER_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        }),
      });
      const elapsed = Date.now() - t0;

      const contentType = res.headers.get("content-type") ?? "";
      const bodyObj = contentType.includes("application/json")
        ? ((await res.json().catch(() => null)) as Record<string, unknown> | null)
        : null;
      const bodyText = contentType.includes("application/json")
        ? null
        : await res.text().catch(() => null);

      const { ok: _ignored, ...rest } = {
        httpStatus: res.status,
        ok: res.ok,
        body: bodyObj ?? bodyText,
        reason: bodyObj && (bodyObj.reason as string | undefined),
        error_description: bodyObj && (bodyObj.error_description as string | undefined),
        wwwAuthenticate: res.headers.get("www-authenticate"),
        elapsedMs: elapsed,
      };

      logger.info(
        "│ 调用函数-test401",
        "调用函数结束：test401",
        "为什么写这条日志：把远端的完整响应（httpStatus + body + WWW-Authenticate header）透传给 page，page 直接展示 OAuth 2.1 §5.2 401 形状。当前：演示结束。",
        { 返回值: rest, 耗时ms: Date.now() - t0 },
      );

      ctx.body = { ok: true, scenario, ...rest };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.info(
        "│ 调用函数-test401",
        "调用函数结束：test401（失败）",
        "为什么写这条日志：远端可能没起、或网络问题。当前：本机 fetch 抛错。",
        { 返回值: { error: message }, 耗时ms: Date.now() - t0 },
      );
      ctx.body = { ok: false, error: message };
    }
  });
}