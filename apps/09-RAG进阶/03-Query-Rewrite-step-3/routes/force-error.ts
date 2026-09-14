/**
 * 职责：GET /api/force-error，故意抛 500 演示另一类失败通道。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { sendError } from "../lib/http/send-error.js";

export function mountForceErrorRoutes(router: Router): void {
  router.post("/api/force-error", (ctx: Context, _next: Next) => {
    sendError(ctx, 500, "演示后端 5xx：这是另一类失败通道，和空问句 4xx 不是同一条。");
  });
}