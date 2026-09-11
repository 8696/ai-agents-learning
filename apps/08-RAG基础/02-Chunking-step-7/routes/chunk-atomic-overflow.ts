/**
 * 职责：POST /api/chunk/atomic-overflow —— atomic 保护版按结构切 + 故意小 threshold 演示超上限。
 * 数据流：body = { text, threshold } → chunkByAtomic(text, threshold) → { chunks, stats }。
 *
 * 与 chunk-atomic.ts 区别：本路由 threshold 默认 200（演示用，故意小），让大 atomic 块超阈值；
 * chunk-atomic.ts 默认 2000（生产阈值）。
 *
 * 不调 LLM：纯本地文本操作，失败仅来自 Zod 校验（4xx）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { chunkByAtomic } from "../lib/flow/chunk-atomic-flow.js";

const bodySchema = z.object({
  text: z.string().min(1, "text 不能为空"),
  threshold: z.coerce.number().int().min(10).max(20000).optional(),
});

export function mountChunkAtomicOverflow(router: Router): void {
  router.post("/api/chunk/atomic-overflow", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法",
        issues: parsed.error.issues,
        hint: "text 必填；threshold 可选整数 100~20000。本路由默认 threshold=200。",
      };
      return;
    }
    const threshold = parsed.data.threshold ?? 200;
    const result = chunkByAtomic(parsed.data.text, threshold);
    ctx.body = { ok: true, result };
  });
}