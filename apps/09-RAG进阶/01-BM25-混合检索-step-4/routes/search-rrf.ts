/**
 * 职责：POST /api/search-rrf。校验入参后调 searchRrf，写 ctx.body。
 * 数据流：{ question, k, topK, n } → searchRrf → RrfSearchResult
 */
import Router from "@koa/router";
import { z } from "zod";
import { searchRrf } from "../lib/flow/rrf.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  question: z.string().min(1, "question 不能为空"),
  k: z.number().int().positive().optional(),
  topK: z.number().int().positive().optional(),
  n: z.number().int().positive().optional(),
});

export function mountSearchRrf(router: Router): void {
  router.post("/api/search-rrf", async (ctx) => {
    const started = Date.now();
    logger.info(
      "search-rrf",
      "调用函数开始：POST /api/search-rrf",
      "提问入口。里面是并行两侧（向量嵌入 + BM25 本地）→ 名次投票 → Top-K。",
      { 入参: jsonBody(ctx), __code: "searchRrf({ question, k, topK, n })" },
    );
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, "请求体不是 { question: string, k?: number, ... }", "检查 JSON；k 必须 ≥1");
      }
      const result = await searchRrf({
        query: parsed.data.question,
        k: parsed.data.k,
        topK: parsed.data.topK,
        n: parsed.data.n,
      });
      logger.info(
        "search-rrf",
        "调用函数结束：POST /api/search-rrf",
        "RRF Top-K 已出；前端将和加权 / 向量 / BM25 多栏对照。",
        { 返回值: result, 耗时ms: Date.now() - started },
      );
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error(
        "search-rrf",
        "调用函数结束：POST /api/search-rrf（失败）",
        error instanceof HttpError ? error.hint : "RRF 检索失败",
        { 返回值: error, 耗时ms: Date.now() - started },
      );
      sendError(ctx, error);
    }
  });
}