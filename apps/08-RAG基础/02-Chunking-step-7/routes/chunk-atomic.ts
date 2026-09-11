/**
 * 职责：POST /api/chunk/atomic —— atomic 块保护版按结构切块（生产阈值）。
 * 数据流：body = { text, threshold? } → chunkByAtomic(text, threshold) → { chunks, stats }。
 *
 * 不调 LLM：纯本地文本操作，失败仅来自 Zod 校验（4xx）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { chunkByAtomic } from "../lib/flow/chunk-atomic-flow.js";
import { MAX_CHUNK_BEFORE_FALLBACK } from "../lib/flow/chunk-atomic.js";

const bodySchema = z.object({
  text: z.string().min(1, "text 不能为空"),
  /** 单 atomic 块超过这个字符数（兜底阈值）就标 fallbackSplit=true 并给说明。默认 2000。 */
  threshold: z.coerce.number().int().min(10).max(20000).optional(),
});

export function mountChunkAtomic(router: Router): void {
  router.post("/api/chunk/atomic", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法",
        issues: parsed.error.issues,
        hint: "text 必填；threshold 可选整数 100~20000。默认 2000。",
      };
      return;
    }
    const threshold = parsed.data.threshold ?? MAX_CHUNK_BEFORE_FALLBACK;
    const result = chunkByAtomic(parsed.data.text, threshold);
    ctx.body = { ok: true, result };
  });
}