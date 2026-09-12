/**
 * 职责：POST /api/chat-threshold —— 命中阈值（top1 score > threshold）端点。
 * 数据流：入参 { question, topK, threshold } → lib/flow/judge-threshold.ts → 写 ctx.body。
 * 演示「流程」：总是检索，看 top1 score 是否过阈值。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { judgeThreshold } from "../lib/flow/judge-threshold.js";
import { logger } from "../lib/logger.js";

export function mountChatThresholdRoute(router: Router): void {
  router.post("/api/chat-threshold", async (ctx: Context) => {
    const t0 = Date.now();
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    logger.info(
      "server.chat-threshold",
      "调用函数开始：/api/chat-threshold",
      "为什么写这条日志：step-6 决策模式 2（命中阈值）入口；下一步交给本步核心判断。",
      {
        入参: body,
        __code: "const result = await judgeThreshold(ctx.request.body);",
      },
    );
    try {
      const result = await judgeThreshold(ctx.request.body);
      logger.info(
        "server.chat-threshold",
        "调用函数结束：/api/chat-threshold",
        `为什么写这条日志：阈值已判断 → branch=${result.branch} → 写 ctx.body。`,
        { 返回值: { branch: result.branch, top1Score: result.top1Score }, 耗时ms: Date.now() - t0 },
      );
      ctx.body = result;
    } catch (err: unknown) {
      logger.error(
        "server.chat-threshold",
        "调用函数结束：/api/chat-threshold（失败）",
        "为什么写这条日志：要让学习者看到失败时是哪个端点挂了。",
        {
          返回值: {
            error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
          },
          耗时ms: Date.now() - t0,
        },
      );
      ctx.status = err instanceof Error && err.message.includes("问题不能为空") ? 400 : 500;
      ctx.body = { error: err instanceof Error ? err.message : String(err) };
    }
  });
}