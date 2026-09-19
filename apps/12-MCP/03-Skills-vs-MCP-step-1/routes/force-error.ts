/**
 * 职责：GET /api/force-error —— 故意返回 5xx，和第二类「页面能看见的 4xx」分开。
 * 数据流：不走出杯流程，直接 500。
 * 为什么单独成文件：这是独立业务 URL，不能塞进三条装配路由。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";

export function mountForceErrorRoutes(router: Router): void {
  router.get("/api/force-error", (ctx: Context, _next: Next) => {
    logger.error(
      "GET /api/force-error",
      "调用函数开始：GET /api/force-error",
      "为什么写这条日志：这是第二类失败通道（5xx），不是空点单那种 400。当前：故意失败。",
      { 入参: {}, __code: "ctx.status = 500" },
    );
    ctx.status = 500;
    ctx.body = { ok: false, error: "这是故意的后端 5xx，用来和空点单 400 对照。" };
    logger.error(
      "GET /api/force-error",
      "调用函数结束：GET /api/force-error（失败）",
      "为什么写这条日志：页面要把状态徽标打成红色。当前：已写 500。",
      { 返回值: ctx.body, 耗时ms: 0 },
    );
  });
}
