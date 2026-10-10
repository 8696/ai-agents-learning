/**
 * 职责：GET /api/force-error —— 故意返回 5xx，和空 orderSlip 400 分开。
 */
import type { Context } from "koa";
import type Router from "@koa/router";

export function mountForceErrorRoutes(router: Router): void {
  router.get("/api/force-error", (ctx: Context) => {
    ctx.status = 500;
    ctx.body = { ok: false, error: "这是故意的后端 5xx，用来和入参不合法 400 对照。" };
  });
}
