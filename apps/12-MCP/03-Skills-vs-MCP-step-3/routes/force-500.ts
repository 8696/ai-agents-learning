/**
 * 职责：POST /api/force-500 —— 第二类失败通道（5xx），与 4xx（参数 / 业务校验）不同通道。
 * 数据流：不走分类 / 提示词入口任何业务逻辑，直接 500。
 * 为什么单独成文件：这是独立业务 URL，不能塞进分类 / 提示词入口路由。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";

export function mountForce500Routes(router: Router): void {
  router.post("/api/force-500", (ctx: Context, _next: Next) => {
    logger.error(
      "POST /api/force-500",
      "调用函数开始：POST /api/force-500",
      "为什么写这条日志：这是第二类失败通道（5xx），与空 optionId 400 / 未知 scenarioId 400 不同通道。当前：故意失败。",
      { 入参: {}, __code: "ctx.status = 500" },
    );
    ctx.status = 500;
    ctx.body = { ok: false, error: "这是故意的后端 5xx，用来和 4xx 对照。" };
    logger.error(
      "POST /api/force-500",
      "调用函数结束：POST /api/force-500（失败）",
      "为什么写这条日志：页面要把状态徽标打成红色。当前：已写 500。",
      { 返回值: ctx.body, 耗时ms: 0 },
    );
  });
}