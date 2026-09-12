/**
 * 职责：POST /api/chat-agent —— 模型自己决定（agent loop 风格）端点。
 * 数据流：入参 { question, topK } → lib/flow/judge-agent.ts → 写 ctx.body。
 * 演示「流程」：先调一次模型让它自己判断「该不该检索」→ 再按判断走分支。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { judgeAgentDecide } from "../lib/flow/judge-agent.js";
import { logger } from "../lib/logger.js";

export function mountChatAgentRoute(router: Router): void {
  router.post("/api/chat-agent", async (ctx: Context) => {
    const t0 = Date.now();
    const body = (ctx.request.body ?? {}) as Record<string, unknown>;
    logger.info(
      "server.chat-agent",
      "调用函数开始：/api/chat-agent",
      "为什么写这条日志：step-6 决策模式 3（agent loop）入口；下一步交给本步核心判断。",
      {
        入参: body,
        __code: "const result = await judgeAgentDecide(ctx.request.body);",
      },
    );
    try {
      const result = await judgeAgentDecide(ctx.request.body);
      logger.info(
        "server.chat-agent",
        "调用函数结束：/api/chat-agent",
        `为什么写这条日志：agent 已判断 → branch=${result.branch} modelSaid=${result.modelSaid} → 写 ctx.body。`,
        { 返回值: { branch: result.branch, modelSaid: result.modelSaid }, 耗时ms: Date.now() - t0 },
      );
      ctx.body = result;
    } catch (err: unknown) {
      logger.error(
        "server.chat-agent",
        "调用函数结束：/api/chat-agent（失败）",
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