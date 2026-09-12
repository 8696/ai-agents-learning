/**
 * 职责：右栏「检索增强生成」端点（POST /api/rag）。校验入参 → 调本步核心 1 → 写 ctx.body。
 * 一个业务 URL 一个 route 文件（§5.3.8）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { answerWithRag } from "../lib/flow/answer-with-rag.js";
import { logger } from "../lib/logger.js";

export function mountRagRoute(router: Router): void {
  router.post("/api/rag", async (ctx: Context) => {
    const t0 = Date.now();
    logger.info(
      "server.rag",
      "调用函数开始：/api/rag",
      "为什么写这条日志：路由层入口；下一步交给本步核心 1（answer-with-rag：search → 拼提示词 → 调模型）。",
      {
        入参: ctx.request.body,
        __code: "const result = await answerWithRag(ctx.request.body);",
      },
    );
    try {
      const result = await answerWithRag(ctx.request.body);
      logger.info(
        "server.rag",
        "调用函数结束：/api/rag",
        "为什么写这条日志：路由层把结果交给浏览器（右栏会看见 answer + 来源列表）。",
        { 返回值: result, 耗时ms: Date.now() - t0 },
      );
      ctx.body = result;
    } catch (err: unknown) {
      logger.error(
        "server.rag",
        "调用函数结束：/api/rag（失败）",
        "为什么写这条日志：要让学习者看到右栏失败时是哪个端点挂了。",
        {
          返回值: {
            error:
              err instanceof Error
                ? { name: err.name, message: err.message, stack: err.stack }
                : String(err),
          },
          耗时ms: Date.now() - t0,
        },
      );
      ctx.status = err instanceof Error && err.message.includes("问题不能为空") ? 400 : 500;
      ctx.body = { error: err instanceof Error ? err.message : String(err) };
    }
  });
}