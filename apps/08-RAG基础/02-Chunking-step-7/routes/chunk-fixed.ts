/**
 * 职责：POST /api/chunk/fixed —— 固定长度切块。
 * 数据流：body = { text, size, overlap } → chunkByFixed → { chunks, stats }。
 *
 * 不调 LLM：纯本地文本操作，失败仅来自 Zod 校验（4xx）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { chunkByFixed, SIZE_MIN, SIZE_MAX, OVERLAP_MIN, OVERLAP_MAX } from "../lib/flow/chunk.js";

const bodySchema = z.object({
  text: z.string().min(1, "text 不能为空"),
  size: z.coerce.number().int().min(SIZE_MIN).max(SIZE_MAX).default(300),
  overlap: z.coerce.number().int().min(OVERLAP_MIN).max(OVERLAP_MAX).default(30),
});

export function mountChunkFixed(router: Router): void {
  router.post("/api/chunk/fixed", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法",
        issues: parsed.error.issues,
        hint: `size 取值 ${SIZE_MIN}~${SIZE_MAX}；overlap 取值 ${OVERLAP_MIN}~${OVERLAP_MAX}；text 必填。`,
      };
      return;
    }
    const result = chunkByFixed(parsed.data.text, parsed.data.size, parsed.data.overlap);
    ctx.body = { ok: true, result };
  });
}