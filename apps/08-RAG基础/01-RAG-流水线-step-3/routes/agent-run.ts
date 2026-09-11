/**
 * 职责：POST /api/agent-run。接收问题，调 agent 循环，返回 trajectory + 最终答案。
 */
import Router from "@koa/router";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";
import { runAgent } from "../lib/agent/agent-loop.js";

export function mountAgentRun(router: Router): void {
  router.post("/api/agent-run", async (ctx) => {
    const started = Date.now();
    logger.info("agent-run", "调用函数开始：POST /api/agent-run", "agent 循环入口。模型自己决定要不要调 search_knowledge。", {
      入参: jsonBody(ctx),
      __code: "runAgent(question)",
    });
    try {
      const body = jsonBody(ctx) as { question?: unknown };
      if (typeof body.question !== "string" || !body.question.trim()) {
        throw new HttpError(400, "问题是空的", "输入框写一句再提问");
      }
      const result = await runAgent(body.question);
      logger.info("agent-run", "调用函数结束：POST /api/agent-run", "agent 跑完，返回轨迹", {
        返回值: result,
        耗时ms: Date.now() - started,
      });
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error(
        "agent-run",
        "调用函数结束：POST /api/agent-run（失败）",
        error instanceof HttpError ? error.hint : "agent 跑挂",
        { 返回值: error, 耗时ms: Date.now() - started },
      );
      sendError(ctx, error);
    }
  });
}