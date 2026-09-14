/**
 * 职责：POST /api/recall。校验问句后调用粗召回，不在这里打精排分。
 */
import type { Context } from "koa";
import Router from "@koa/router";
import { z } from "zod";
import { recallCandidates } from "../lib/flow/recall.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(8).optional(),
});

export function mountRecall(router: Router): void {
  router.post("/api/recall", (ctx: Context) => {
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, "请求体对不上", "需要 query 字符串，limit 可选");
      }
      const query = parsed.data.query.trim();
      if (!query) {
        throw new HttpError(400, "问句是空的", "第一阶段没有问句就无法从整库捞候选");
      }
      const limit = parsed.data.limit ?? 6;
      ctx.body = { ok: true, ...recallCandidates(query, limit) };
    } catch (error: unknown) {
      sendError(ctx, error);
    }
  });
}
