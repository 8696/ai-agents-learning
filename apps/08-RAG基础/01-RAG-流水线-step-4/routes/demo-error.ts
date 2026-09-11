/**
 * 职责：GET /api/demo-error。故意 5xx，和第二类错误（空问题 4xx）分开。
 */
import Router from "@koa/router";

export function mountDemoError(router: Router): void {
  router.get("/api/demo-error", (ctx) => {
    ctx.status = 500;
    ctx.body = {
      ok: false,
      error: "故意返回的服务端错误",
      hint: "这是第二类错误（5xx）。空问题是 4xx，两套红字应能分开。",
    };
  });
}
