/**
 * 职责：GET /api/demo-error —— 故意 5xx。配合各 sub-page 的「演示上游失败」按钮。
 * 这是 §5.3.2 #2「第二类错误」通道。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";

export function mountDemoErrorRoute(router: Router): void {
  router.get("/api/demo-error", (ctx: Context) => {
    logger.warn(
      "│ 调用函数-/api/demo-error",
      "调用函数结束：/api/demo-error（演示上游失败）",
      "为什么写这条日志：让学习者看见 sub-page 的「演示上游失败」按钮触发时是这一条路径走的。",
      { 返回值: { status: 500 }, 耗时ms: 0 },
    );
    ctx.status = 500;
    ctx.body = {
      ok: false,
      error: "演示上游失败（demo-error）：模拟服务端 5xx 响应",
      hint: "这是 §5.3.2 第二类错误（5xx）。",
    };
  });
}