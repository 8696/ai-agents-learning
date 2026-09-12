/**
 * 职责：POST /api/search-bm25。校验问句后调 searchByBm25，写 ctx.body。
 * 数据流：{ question, topK } → searchByBm25 → { query, tokens, rows }
 */
import Router from "@koa/router";
import { z } from "zod";
import { searchByBm25 } from "../lib/flow/bm25-vs-vector.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  question: z.string(),
  topK: z.number().int().positive().optional(),
});

export function mountSearchBm25(router: Router): void {
  router.post("/api/search-bm25", async (ctx) => {
    const started = Date.now();
    logger.info(
      "search-bm25",
      "调用函数开始：POST /api/search-bm25",
      "提问入口。里面是纯本地的 BM25 打分，不调网络。",
      { 入参: jsonBody(ctx), __code: "searchByBm25({ question, topK })" },
    );
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, "请求体不是 { question: string, topK?: number }", "检查 JSON");
      }
      const result = await searchByBm25({
        query: parsed.data.question,
        topK: parsed.data.topK,
      });
      logger.info(
        "search-bm25",
        "调用函数结束：POST /api/search-bm25",
        "BM25 侧 Top-K 已出；前端将和向量侧并排显示。",
        { 返回值: result, 耗时ms: Date.now() - started },
      );
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error(
        "search-bm25",
        "调用函数结束：POST /api/search-bm25（失败）",
        error instanceof HttpError ? error.hint : "BM25 检索失败",
        { 返回值: error, 耗时ms: Date.now() - started },
      );
      sendError(ctx, error);
    }
  });
}