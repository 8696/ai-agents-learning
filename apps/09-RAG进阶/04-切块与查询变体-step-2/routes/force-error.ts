/**
 * 职责：POST /api/force-error，故意回 5xx，和第二类错误对照。
 * 数据流：不跑检索，直接 500。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { sendError } from "../lib/http/send-error.js";

export function mountForceErrorRoutes(router: Router): void {
  router.post("/api/force-error", (ctx: Context) => {
    sendError(ctx, 500, {
      error: "FORCE_ERROR",
      explain: "这是故意触发的服务端 5xx，用来和空问句 4xx 分开看。",
    });
  });
}
