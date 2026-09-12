/**
 * 职责：POST /api/search-vector。校验问句后调 searchByVector，写 ctx.body。
 * 数据流：{ question, topK } → searchByVector → { query, topK, rows, embeddingModel }
 */
import Router from "@koa/router";
import { z } from "zod";
import { searchByVector } from "../lib/flow/bm25-vs-vector.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  question: z.string(),
  topK: z.number().int().positive().optional(),
});

export function mountSearchVector(router: Router): void {
  router.post("/api/search-vector", async (ctx) => {
    const started = Date.now();
    logger.info(
      "search-vector",
      "调用函数开始：POST /api/search-vector",
      "提问入口。里面才是真发网络请求的嵌入调用（调 LLM 拿 query 向量）。",
      { 入参: jsonBody(ctx), __code: "searchByVector({ question, topK })" },
    );
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, "请求体不是 { question: string, topK?: number }", "检查 JSON");
      }
      const result = await searchByVector({
        query: parsed.data.question,
        topK: parsed.data.topK,
      });
      logger.info(
        "search-vector",
        "调用函数结束：POST /api/search-vector",
        "向量侧 Top-K 已出；前端将和 BM25 侧并排显示。",
        { 返回值: result, 耗时ms: Date.now() - started },
      );
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error(
        "search-vector",
        "调用函数结束：POST /api/search-vector（失败）",
        error instanceof HttpError ? error.hint : "向量检索失败",
        { 返回值: error, 耗时ms: Date.now() - started },
      );
      sendError(ctx, error);
    }
  });
}