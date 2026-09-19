/**
 * 职责：route handler 包装 —— 从请求里解 Bearer token，注入 ALS，
 *       让下游 SDK 调用（dynamicAuthFetch）能拿到当前请求的 token。
 *
 * 数据流：浏览器 fetch 进来 → koa route handler
 *   → withRequestToken(async (ctx) => { ... 业务 ... })
 *     → 解析 Authorization 头
 *     → runWithRequestContext({ token }, () => handler(ctx))
 *       → handler 内部调 callTool / listTools 等
 *         → SDK 走 dynamicAuthFetch → 读 ALS 当前 token → 拼 Authorization 头
 *
 * 为什么单独成文件：所有 route 都需要这个包装；不抽出来 7 个文件 7 份重复代码。
 */
import type { Context } from "koa";
import {
  extractBearerToken,
  runWithRequestContext,
} from "../lib/flow/request-context.js";

type Handler = (ctx: Context) => Promise<unknown> | unknown;

export function withRequestToken(handler: Handler): Handler {
  return async (ctx) => {
    const token = extractBearerToken(ctx.req.headers.authorization);
    await runWithRequestContext({ token }, async () => {
      await handler(ctx);
    });
  };
}
