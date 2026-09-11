/**
 * 职责：POST /api/ask。校验问题后走检索 + 生成，不再拆库。
 */
import Router from "@koa/router";
import { z } from "zod";
import { runAsk } from "../lib/flow/ask-pipeline.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  question: z.string(),
});

export function mountAsk(router: Router): void {
  router.post("/api/ask", async (ctx) => {
    const started = Date.now();
    logger.info("ask", "调用函数开始：POST /api/ask", "提问入口。里面才是问题向量化 / 检索 / 生成。", {
      入参: jsonBody(ctx),
      __code: "runAsk(question)",
    });
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, "请求体不是 { question: string }", "检查 JSON");
      }
      const question = parsed.data.question.trim();
      if (!question) {
        throw new HttpError(400, "问题是空的", "输入框写一句再提问。这是第一类错误（4xx）。");
      }
      const result = await runAsk(question);
      logger.info("ask", "调用函数结束：POST /api/ask", "提问完成；stepsRan 不应包含 load/chunk。", {
        返回值: result,
        耗时ms: Date.now() - started,
      });
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error(
        "ask",
        "调用函数结束：POST /api/ask（失败）",
        error instanceof HttpError ? error.hint : "提问失败",
        { 返回值: error, 耗时ms: Date.now() - started },
      );
      sendError(ctx, error);
    }
  });
}
