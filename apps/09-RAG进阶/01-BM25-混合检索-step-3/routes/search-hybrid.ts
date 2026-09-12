/**
 * 职责：POST /api/search-hybrid。校验入参后调 searchHybrid，写 ctx.body。
 * 数据流：{ question, alpha, topK, normalize, n } → searchHybrid → HybridSearchResult
 *
 * 入参校验：
 *   - alpha ∈ [0, 1]：α=0 = 全 BM25；α=1 = 全向量；α=0.5 = 各半
 *   - topK ≥ 1：截前 K 条
 *   - normalize=true（默认）：min-max 归一化；false 时直接用原始分（演示「不拉齐会翻车」）
 */
import Router from "@koa/router";
import { z } from "zod";
import { searchHybrid } from "../lib/flow/hybrid-search.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  question: z.string().min(1, "question 不能为空"),
  alpha: z.number().min(0).max(1).optional(),
  topK: z.number().int().positive().optional(),
  normalize: z.boolean().optional(),
  n: z.number().int().positive().optional(),
});

export function mountSearchHybrid(router: Router): void {
  router.post("/api/search-hybrid", async (ctx) => {
    const started = Date.now();
    logger.info(
      "search-hybrid",
      "调用函数开始：POST /api/search-hybrid",
      "提问入口。里面是并行两侧（向量嵌入 + BM25 本地）→ min-max → 加权 → Top-K。",
      { 入参: jsonBody(ctx), __code: "searchHybrid({ question, alpha, topK, normalize, n })" },
    );
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, "请求体不是 { question: string, alpha?: [0,1], ... }", "检查 JSON；alpha 必须 0~1");
      }
      const result = await searchHybrid({
        query: parsed.data.question,
        alpha: parsed.data.alpha,
        topK: parsed.data.topK,
        normalize: parsed.data.normalize,
        n: parsed.data.n,
      });
      logger.info(
        "search-hybrid",
        "调用函数结束：POST /api/search-hybrid",
        "混合 Top-K 已出；前端将和向量 / BM25 三栏并排显示。",
        { 返回值: result, 耗时ms: Date.now() - started },
      );
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error(
        "search-hybrid",
        "调用函数结束：POST /api/search-hybrid（失败）",
        error instanceof HttpError ? error.hint : "混合检索失败",
        { 返回值: error, 耗时ms: Date.now() - started },
      );
      sendError(ctx, error);
    }
  });
}