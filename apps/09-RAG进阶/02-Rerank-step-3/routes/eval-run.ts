/**
 * 职责：POST /api/eval-run。接 pipeline 名 + K → 跑评测 → 返结果。
 * 教学简化：mock 精排不调真对话模型（见 lib/flow/eval.ts 注释）。
 */
import type { Context } from "koa";
import Router from "@koa/router";
import { z } from "zod";
import { runEval, type PipelineName } from "../lib/flow/eval.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  pipeline: z.enum(["recall", "recall+pointwise", "recall+listwise"]),
  k: z.number().int().min(1).max(8),
});

export function mountEvalRun(router: Router): void {
  router.post("/api/eval-run", (ctx: Context) => {
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, "请求体对不上", "需要 pipeline（recall / recall+pointwise / recall+listwise）和 k（1~8）");
      }
      const pipeline: PipelineName = parsed.data.pipeline;
      const k = parsed.data.k;
      const result = runEval(pipeline, k);
      ctx.body = { ok: true, ...result };
    } catch (error: unknown) {
      sendError(ctx, error);
    }
  });
}
