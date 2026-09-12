/**
 * 职责：POST /api/demo-error —— 第二类失败：服务端 5xx，和 4xx 空卡片分开。
 *
 * 数据流：进路由 → 固定 500，不打分。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

export function mountDemoErrorRoutes(router: Router): void {
  router.post("/api/demo-error", (ctx: Context, _next: Next) => {
    logger.info(
      "演示失败-5xx",
      "调用函数开始：demoError",
      "为什么写这条日志：本页第二类失败要能和 4xx 一眼分开。当前：故意返回 500。",
      {
        入参: null,
        __code: "sendError(ctx, 500, { ok: false, error: \"演示上游失败（5xx）\" })",
      },
    );
    sendError(ctx, 500, { ok: false, error: "演示上游失败（5xx）。这不是打分算错，是服务端自己炸了。" });
    logger.info(
      "演示失败-5xx",
      "调用函数结束：demoError",
      "为什么写这条日志：页面红字 + 状态徽标变红。当前：500 已写出。",
      { 返回值: { ok: false, status: 500 }, 耗时ms: 0 },
    );
  });
}
