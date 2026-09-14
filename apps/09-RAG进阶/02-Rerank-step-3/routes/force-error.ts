/**
 * 职责：GET /api/force-error。第二类失败通道：页面能看见的 5xx。
 */
import type { Context } from "koa";
import Router from "@koa/router";
import { HttpError, sendError } from "../lib/http/send-error.js";

export function mountForceError(router: Router): void {
  router.get("/api/force-error", (ctx: Context) => {
    sendError(ctx, new HttpError(500, "演示用的服务端错误", "这是第二类失败：5xx，和空问句的 4xx 分开看"));
  });
}
