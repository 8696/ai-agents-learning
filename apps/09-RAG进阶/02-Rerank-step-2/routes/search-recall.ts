/**
 * 职责：POST /api/search-recall —— 第一阶段粗召回（向量 + BM25 + RRF 融合）。
 *       与 /api/rerank 分请求 —— 严守"两阶段不打包"（§5.3.8）。
 */
import type Router from "@koa/router";
import type { Context } from "koa";
import { z } from "zod";
import { recallOnce } from "../lib/flow/recall.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  question: z.string().min(1, "问句不能为空"),
  /** 粗召回从库里捞多少条喂给精排；本 demo 默认 5 */
  n: z.number().int().min(1).max(50).optional().default(5),
});

export function mountSearchRecall(router: Router): void {
  router.post("/api/search-recall", async (ctx: Context) => {
    const started = Date.now();
    logger.info(
      "search-recall",
      "调用函数开始：POST /api/search-recall",
      "粗召回入口。里面并行调向量嵌入 + BM25 本地，再 RRF 融合。当前：路由刚拿到请求体，准备校验。",
      { 入参: jsonBody(ctx), __code: "recallOnce(question, n)" },
    );
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues[0]?.message ?? "入参不对", "检查 question / n");
      }
      const raw = await recallOnce(parsed.data.question, parsed.data.n);
      // recallOnce 返回的是「向量 Top-N + BM25 Top-N」去重融合后的完整榜（可能 > N），
      // 本 demo step-2 严格按 N 截断候选，保证「N=几就几条候选」对得上。
      // step-1 不截断是它自己的教学点（演「B 在第 12 名 / N 太小救不了召回漏」），
      // step-2 教学点是「业务加权在候选内重排」，按 N 截断更易观察名次跳。
      const result = { ...raw, rows: raw.rows.slice(0, raw.n) };
      logger.info(
        "search-recall",
        "调用函数结束：POST /api/search-recall",
        "粗召回完成；前端下一步可点「继续精排」把这份候选送进 /api/rerank。",
        { 返回值: result, 耗时ms: Date.now() - started },
      );
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error(
        "search-recall",
        "调用函数结束：POST /api/search-recall（失败）",
        error instanceof HttpError ? error.hint : "粗召回失败",
        { 返回值: error, 耗时ms: Date.now() - started },
      );
      sendError(ctx, error);
    }
  });
}