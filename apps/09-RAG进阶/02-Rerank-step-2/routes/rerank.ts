/**
 * 职责：POST /api/rerank —— 第二阶段精排（真调大模型按"问句+文档"成对打分 → 重排）。
 *       与 /api/search-recall 分请求 —— 严守"两阶段不打包"（§5.3.8）。
 */
import type Router from "@koa/router";
import type { Context } from "koa";
import { z } from "zod";
import { scoreAndRerank, skipRerank } from "../lib/flow/rerank.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const rrfRowSchema = z.object({
  cardId: z.string(),
  text: z.string(),
  rrfScore: z.number(),
  vectorRank: z.number(),
  bm25Rank: z.number(),
  vectorContribution: z.number(),
  bm25Contribution: z.number(),
  source: z.enum(["vector", "bm25", "both"]),
});

const bodySchema = z.object({
  query: z.string().min(1, "query 不能为空"),
  candidates: z.array(rrfRowSchema).min(1, "候选不能为空；先调 /api/search-recall 拿候选"),
  /** 精排开关；默认 true。false 时直接按 RRF 榜截 K 返回，不调模型（变体 12） */
  rerankOn: z.boolean().optional().default(true),
});

export function mountRerank(router: Router): void {
  router.post("/api/rerank", async (ctx: Context) => {
    const started = Date.now();
    logger.info(
      "rerank",
      "调用函数开始：POST /api/rerank",
      "精排入口。里面真发网络请求的对话模型调用，对每对「问句 + 文档」出 0~1 分，再按分重排。当前：路由拿到候选，准备调 scoreAndRerank。",
      {
        入参: {
          query: (jsonBody(ctx) as { query?: string })?.query,
          candidatesCount: (jsonBody(ctx) as { candidates?: unknown[] })?.candidates?.length ?? 0,
        },
        __code: "scoreAndRerank({ query, candidates })",
      },
    );
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues[0]?.message ?? "入参不对", "检查 query / candidates");
      }
      const { query, candidates, rerankOn: on } = parsed.data;
      const result = on
        ? await scoreAndRerank({ query, candidates })
        : await skipRerank({ query, candidates });
      logger.info(
        "rerank",
        "调用函数结束：POST /api/rerank",
        "精排已完成；前端可与粗召回榜并排看名次跳动。",
        { 返回值: result, 耗时ms: Date.now() - started },
      );
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error(
        "rerank",
        "调用函数结束：POST /api/rerank（失败）",
        error instanceof HttpError ? error.hint : "精排失败",
        { 返回值: error, 耗时ms: Date.now() - started },
      );
      sendError(ctx, error);
    }
  });
}