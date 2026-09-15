/**
 * 职责：POST /api/dedup-by-embedding，跨 key 语义去重入口。
 *
 * 数据流：{ text, threshold } → 调 dedupByEmbedding → 返回库里最相似那条 + 相似度。
 *
 * 跟 routes/dedup.ts（4-A 字面 key 比对）并列：用户可以选字面去重 / 跨 key 语义查重。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { dedupByEmbedding } from "../lib/flow/dedup-by-embedding.js";
import { logger } from "../lib/logger.js";

const BodySchema = z.object({
  text: z.string().min(1, "text 不能为空"),
  threshold: z.coerce.number().min(0).max(1).default(0.9),
  mergeToBestMatch: z.coerce.boolean().default(false),
});

export function mountDedupByEmbeddingRoutes(router: Router): void {
  router.post("/api/dedup-by-embedding", async (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 text 字符串 + threshold 数值（[0, 1]，可省略默认 0.9）。",
      });
      return;
    }

    const { text, threshold, mergeToBestMatch } = parsed.data;

    logger.info(
      "调用函数-路由-dedup-by-embedding",
      "调用函数开始：POST /api/dedup-by-embedding",
      "为什么写这条日志：变体 4-C 入口——用户填一段文本 + threshold，请求语义查重。当前：拿到 text + threshold，准备调 dedupByEmbedding。",
      { 入参: { text, threshold }, __code: "const result = await dedupByEmbedding(text, threshold, mergeToBestMatch);" },
    );

    const t0 = Date.now();
    const result = await dedupByEmbedding(text, threshold, mergeToBestMatch);

    logger.info(
      "调用函数-路由-dedup-by-embedding",
      "调用函数结束：POST /api/dedup-by-embedding",
      `为什么写这条日志：要把查重结果返回给页面 + 记下耗时。当前：返回 action = ${result.action}。`,
      { 返回值: result, 耗时ms: Date.now() - t0 },
    );

    ctx.body = result;
  });
}
