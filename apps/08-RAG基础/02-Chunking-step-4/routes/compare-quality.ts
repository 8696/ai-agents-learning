/**
 * 职责：POST /api/chunk/compare-quality —— 两套切块参数同时评估（step-3 · A 件）。
 * 数据流：body = { text, sizeA, overlapA, sizeB, overlapB, topK } →
两套 chunkByFixed + 两份 evaluateQuality → 返回 {reportA, reportB}。
 *
 * 不调 LLM：纯本地文本操作 + 模拟最高分。失败仅来自 Zod 校验（4xx）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { chunkByFixed, SIZE_MIN, SIZE_MAX, OVERLAP_MIN, OVERLAP_MAX } from "../lib/flow/chunk.js";
import { evaluateQuality } from "../lib/flow/quality.js";

const bodySchema = z.object({
  text: z.string().min(200, "text 太短（< 200 字符）；sizeA / sizeB 都装得下，对比无意义。请输入 ≥ 200 字符或加载长示例。"),
  sizeA: z.coerce.number().int().min(SIZE_MIN).max(SIZE_MAX).default(300),
  overlapA: z.coerce.number().int().min(OVERLAP_MIN).max(OVERLAP_MAX).default(30),
  sizeB: z.coerce.number().int().min(SIZE_MIN).max(SIZE_MAX).default(800),
  overlapB: z.coerce.number().int().min(OVERLAP_MIN).max(OVERLAP_MAX).default(80),
  topK: z.coerce.number().int().min(1).max(50).default(5),
});

export function mountCompareQuality(router: Router): void {
  router.post("/api/chunk/compare-quality", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法",
        issues: parsed.error.issues,
        hint: `sizeA / sizeB 取值 ${SIZE_MIN}~${SIZE_MAX}；overlap 取值 ${OVERLAP_MIN}~${OVERLAP_MAX}；topK 1~50；text 必填。`,
      };
      return;
    }
    const { text, sizeA, overlapA, sizeB, overlapB, topK } = parsed.data;
    const resultA = chunkByFixed(text, sizeA, overlapA);
    const resultB = chunkByFixed(text, sizeB, overlapB);
    const reportA = evaluateQuality(resultA.chunks, topK);
    const reportB = evaluateQuality(resultB.chunks, topK);
    ctx.body = {
      ok: true,
      result: {
        reportA: { ...reportA, params: { size: sizeA, overlap: overlapA } },
        reportB: { ...reportB, params: { size: sizeB, overlap: overlapB } },
      },
    };
  });
}