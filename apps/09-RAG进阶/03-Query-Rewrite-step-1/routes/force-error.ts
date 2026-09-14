/**
 * 职责：POST /api/force-error，第二类错误通道（5xx），和空问句 4xx 分开。
 * 数据流：无入参 → 固定 500。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { sendError } from "../lib/http/send-error.js";

export function mountForceErrorRoutes(router: Router): void {
  router.post("/api/force-error", (ctx: Context, _next: Next) => {
    sendError(ctx, 500, "这是演示用的后端 5xx。和空问句的 4xx 不是同一条通道。");
  });
}
