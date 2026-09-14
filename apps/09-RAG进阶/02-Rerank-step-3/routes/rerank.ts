/**
 * 职责：POST /api/rerank。只接收桌上的候选 id，调用精排主流程。
 * 入参：mode: "on" | "off"（默认 on）；off 时不调模型，退化成召回前 K。
 */
import type { Context } from "koa";
import Router from "@koa/router";
import { z } from "zod";
import { rerankCandidates } from "../lib/flow/rerank.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
  candidateIds: z.array(z.string()).min(1),
  recallRankById: z.record(z.string(), z.number().int().positive()),
  coarseScoreById: z.record(z.string(), z.number()).optional(),
  mode: z.enum(["on", "off"]).optional(),
});

export function mountRerank(router: Router): void {
  router.post("/api/rerank", async (ctx: Context) => {
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, "请求体对不上", "需要 query、candidateIds、recallRankById；可选 mode(coarseScoreById)");
      }
      const query = parsed.data.query.trim();
      if (!query) {
        throw new HttpError(400, "问句是空的", "精排必须带着原来那句问话，不能只对切块打分");
      }
      const result = await rerankCandidates(
        query,
        parsed.data.candidateIds,
        parsed.data.recallRankById,
        parsed.data.coarseScoreById ?? {},
        parsed.data.mode ?? "on",
      );
      ctx.body = { ok: true, ...result };
    } catch (error: unknown) {
      sendError(ctx, error);
    }
  });
}
