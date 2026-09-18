/**
 * 职责：GET /api/force-error。第二类失败：HTTP 5xx。对照：发数组请求体是 HTTP 4xx。
 * 数据流：固定 500 + 中文错误。
 */
import type { Context } from "koa";
import type Router from "@koa/router";

export function mountForceError(router: Router): void {
  router.get("/api/force-error", (ctx: Context) => {
    ctx.status = 500;
    ctx.body = {
      ok: false,
      error: "故意的 HTTP 5xx。对照：把数组当请求体是 HTTP 4xx，还没进 JSON-RPC。",
    };
  });
}
