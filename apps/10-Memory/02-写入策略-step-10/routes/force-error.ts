/**
 * 职责：GET /api/force-error，故意抛 5xx 让前端看到错误态。
 * 数据流：throw new Error → koa 全局错误处理 → 返 { error: "INTERNAL_ERROR", explain }。
 *
 * 满足 §5.3.2 #2 错误处理第二类：本步默认无业务错误触发场景（时间快进 / recall 都是同步无网络），用 force-error 演示。
 */
import type { Context } from "koa";
import type Router from "@koa/router";

export function mountForceErrorRoutes(router: Router): void {
  router.get("/api/force-error", (_ctx: Context) => {
    throw new Error("演示 5xx：GET /api/force-error 主动抛错");
  });
}