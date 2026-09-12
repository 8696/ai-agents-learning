/**
 * 职责：GET /health，给页脚填端口 / 模型服务商 / 模型 / 密钥。本步不调大模型。
 *
 * 数据流：readHealth() → ctx.body。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { readHealth } from "../lib/http/runtime-ctx.js";

export function mountHealthRoutes(router: Router): void {
  router.get("/health", (ctx: Context, _next: Next) => {
    ctx.body = readHealth();
  });
}
