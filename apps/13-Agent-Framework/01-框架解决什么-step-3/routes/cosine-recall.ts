/**
 * 职责：POST /api/cosine-recall。余弦检索子页：embed + embedMany 并发 + 余弦相似度排序取 Top-K。
 *
 * 数据流：body.{ query, documents[], topK, provider } → runCosineRecall → ctx.res（一次性 JSON）。
 *   provider ∈ PRODUCTION_PROVIDER_IDS；
 *   documents 元素数 1~200；
 *   topK ∈ 1..documents.length（页面前端控制范围）；
 *   入参校验失败 → 4xx { ok:false, issues }；服务起那一刻 client close → abort.abort()。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { PRODUCTION_PROVIDER_IDS } from "../../../llm.js";
import { runCosineRecall } from "../lib/flow/cosine-recall.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  query: z.string().min(1).max(8000),
  documents: z.array(z.string().min(1).max(8000)).min(2).max(200),
  topK: z.number().int().min(1).max(50),
  provider: z.enum(PRODUCTION_PROVIDER_IDS).optional(),
});

export function mountCosineRecallRoutes(router: Router): void {
  router.post("/api/cosine-recall", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参缺字段 / 不在允许范围；query 非空；documents 元素数 2..200；topK 整数 1..50；provider ∈ minimax|zhipu|deepseek|qwen。", issues: parsed.error.issues };
      return;
    }
    const provider = parsed.data.provider ?? "minimax";
    const abort = new AbortController();
    ctx.req.on("close", () => abort.abort());
    try {
      await runCosineRecall({
        providerId: provider,
        query: parsed.data.query,
        documents: parsed.data.documents,
        topK: parsed.data.topK,
        response: ctx.res,
        abortSignal: abort.signal,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("cosine-recall.route", "结束：runCosineRecall（失败）", "JSON 写响应失败；上面已经写过 500 头了。", {
        入参: { provider, queryLen: parsed.data.query.length, documentsLen: parsed.data.documents.length, topK: parsed.data.topK },
        返回值: { message },
      });
    }
  });
}