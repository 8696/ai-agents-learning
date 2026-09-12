/**
 * 职责：POST /api/search-bm25-variant。校验入参后调 bm25Variant，写 ctx.body。
 * 数据流：{ question, topK } → bm25Variant → Bm25VariantSearchResult
 */
import Router from "@koa/router";
import { z } from "zod";
import { bm25Variant } from "../lib/flow/bm25-variant.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  question: z.string().min(1, "question 不能为空"),
  topK: z.number().int().positive().optional(),
});

export function mountSearchBm25Variant(router: Router): void {
  router.post("/api/search-bm25-variant", async (ctx) => {
    const started = Date.now();
    logger.info(
      "search-bm25-variant",
      "调用函数开始：POST /api/search-bm25-variant",
      "提问入口。里面两次 BM25（mode=keep-dash vs split-chars）→ 两份 Top-K。",
      { 入参: jsonBody(ctx), __code: "bm25Variant({ question, topK })" },
    );
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, "请求体不是 { question: string, topK?: number }", "检查 JSON");
      }
      const result = await bm25Variant({
        query: parsed.data.question,
        topK: parsed.data.topK,
      });
      logger.info(
        "search-bm25-variant",
        "调用函数结束：POST /api/search-bm25-variant",
        "切词对照结果已出；前端将两表并排展示。",
        { 返回值: result, 耗时ms: Date.now() - started },
      );
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error(
        "search-bm25-variant",
        "调用函数结束：POST /api/search-bm25-variant（失败）",
        error instanceof HttpError ? error.hint : "切词对照失败",
        { 返回值: error, 耗时ms: Date.now() - started },
      );
      sendError(ctx, error);
    }
  });
}