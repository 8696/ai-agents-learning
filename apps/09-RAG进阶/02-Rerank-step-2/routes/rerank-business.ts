/**
 * 职责：POST /api/rerank-business —— 第三层「业务加权」重排（沿用神经精排结果 + 按 updatedAt 距离加 bonus）。
 *       与 /api/rerank 分请求 —— 业务加权独立开关，不和神经精排绑死。
 *
 * 数据流：客户端先调 /api/search-recall → /api/rerank 拿到神经精排结果 →
 *       再调 /api/rerank-business，把神经精排后的 rows 当 candidates，配合 businessWeight 配置。
 */
import type Router from "@koa/router";
import type { Context } from "koa";
import { z } from "zod";
import { scoreAndRerankBusiness } from "../lib/flow/rerank-business.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const rerankRowSchema = z.object({
  cardId: z.string(),
  text: z.string(),
  rerankScore: z.number(),
  rank: z.number(),
  previousRank: z.number(),
  rawRank: z.number(),
  rrfScore: z.number(),
});

const bodySchema = z.object({
  query: z.string().min(1, "query 不能为空"),
  /** 神经精排后的候选（一般是 /api/rerank 返回的 rows） */
  candidates: z.array(rerankRowSchema).min(1, "候选不能为空；先调 /api/rerank 拿神经精排结果"),
  businessWeight: z.object({
    /** 业务加权开关：false 时等同纯神经精排（不改名次） */
    on: z.boolean(),
    /** 窗口天数：updatedAt 距今 ≤ recentDays 视为"近" */
    recentDays: z.number().int().min(1).max(365),
    /** 加权分：神经分之外附加的固定加分 */
    bonus: z.number().min(0).max(1),
  }),
});

export function mountRerankBusiness(router: Router): void {
  router.post("/api/rerank-business", async (ctx: Context) => {
    const started = Date.now();
    logger.info(
      "rerank-business",
      "调用函数开始：POST /api/rerank-business",
      "业务加权入口。纯本地计算（不调模型）：按每张候选的 updatedAt 与今天（教学锚点 TODAY_ISO）比距离，符合窗口的卡片加 bonus，再按「神经分 + bonus」重排。当前：路由拿到神经精排候选 + businessWeight 配置，准备调 scoreAndRerankBusiness。",
      {
        入参: {
          query: (jsonBody(ctx) as { query?: string })?.query,
          candidatesCount: (jsonBody(ctx) as { candidates?: unknown[] })?.candidates?.length ?? 0,
          businessWeight: (jsonBody(ctx) as { businessWeight?: unknown })?.businessWeight,
        },
        __code: "scoreAndRerankBusiness({ query, candidates, businessWeight })",
      },
    );
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues[0]?.message ?? "入参不对", "检查 query / candidates / businessWeight");
      }
      const result = await scoreAndRerankBusiness(parsed.data);
      logger.info(
        "rerank-business",
        "调用函数结束：POST /api/rerank-business",
        "业务加权完成；前端可与神经精排榜并排看名次变化来源（神经 vs 业务规则）。",
        { 返回值: result, 耗时ms: Date.now() - started },
      );
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error(
        "rerank-business",
        "调用函数结束：POST /api/rerank-business（失败）",
        error instanceof HttpError ? error.hint : "业务加权失败",
        { 返回值: error, 耗时ms: Date.now() - started },
      );
      sendError(ctx, error);
    }
  });
}