/**
 * 职责：POST /api/force-error，故意返回 5xx，演示与「空输入 400」不同的另一条失败通道。
 * 数据流：不读入参，直接 sendError(500)。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

export function mountForceErrorRoutes(router: Router): void {
  router.post("/api/force-error", (ctx: Context) => {
    logger.info(
      "调用函数-force-error",
      "调用函数开始：force-error",
      "为什么写这条日志：这条端点故意失败，用来跟「原文是空的」区分成两类不同的失败通道。当前：即将直接返回 500。",
      { 入参: {}, __code: 'sendError(ctx, 500, { error: "FORCE_ERROR", explain: "..." });' },
    );
    sendError(ctx, 500, {
      error: "FORCE_ERROR",
      explain: "这是故意触发的后端 5xx，用来演示跟「原文是空的」那类 4xx 不同的另一条失败通道。",
    });
    logger.info(
      "调用函数-force-error",
      "调用函数结束：force-error（失败）",
      "为什么写这条日志：记下这次是主动触发的失败，不是真的服务故障。当前：已写完 500 响应。",
      { 返回值: { status: 500 }, 耗时ms: 0 },
    );
  });
}
