/**
 * 职责：POST /api/chat-routing —— 路由层规则（关键词判断）端点。
 * 数据流：入参 { question, topK } → lib/flow/judge-routing-rules.ts → 写 ctx.body。
 * 演示「流程」：同一道题，单一端点，内部判断走检索 / 直接答。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { judgeRoutingRules } from "../lib/flow/judge-routing-rules.js";
import { logger } from "../lib/logger.js";

export function mountChatRoutingRoute(router: Router): void {
  router.post("/api/chat-routing", async (ctx: Context) => {
    const t0 = Date.now();
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    logger.info(
      "server.chat-routing",
      "调用函数开始：/api/chat-routing",
      "为什么写这条日志：step-6 决策模式 1（路由层规则）入口；下一步交给本步核心判断。",
      {
        入参: body,
        __code: "const result = await judgeRoutingRules(ctx.request.body);",
      },
    );
    try {
      const result = await judgeRoutingRules(ctx.request.body);
      logger.info(
        "server.chat-routing",
        "调用函数结束：/api/chat-routing",
        `为什么写这条日志：路由层已判断 → branch=${result.branch} → 写 ctx.body。`,
        { 返回值: { branch: result.branch, reason: result.reason }, 耗时ms: Date.now() - t0 },
      );
      ctx.body = result;
    } catch (err: unknown) {
      logger.error(
        "server.chat-routing",
        "调用函数结束：/api/chat-routing（失败）",
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