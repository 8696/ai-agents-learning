/**
 * 职责：POST /api/compare-bm25 —— 自定义问句，手写 vs wink 并排 Top-K（不跑判定规则）。
 */
import type { Context } from "koa";
import Router from "@koa/router";
import { z } from "zod";
import { compareOnce } from "../lib/flow/handwritten-vs-wink.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const BodySchema = z.object({
  question: z.string().min(1, "问句不能空"),
  topK: z.number().int().min(1).max(20).optional().default(5),
});

export function mountCompareBm25(router: Router): void {
  router.post("/api/compare-bm25", async (ctx: Context) => {
    const started = Date.now();
    try {
      const parsed = BodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, parsed.error.issues[0]?.message ?? "入参不对", "检查 question / topK");
      }
      const result = await compareOnce(parsed.data.question, parsed.data.topK);
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      logger.error(
        "路由-compare-bm25",
        "调用函数结束：compareOnce（失败）",
        error instanceof HttpError ? error.hint : "对照失败",
        { 返回值: error, 耗时ms: Date.now() - started },
      );
      sendError(ctx, error);
    }
  });
}
