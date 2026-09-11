/**
 * 职责：POST /api/chunk/compare-overlap —— 需求 5。
 * 同一份文档 + 同一 size，分别按 overlap=0% / 10% / 30% 各跑一次 chunkByFixed，
 * 返回三组「块数 / 总字符 / 嵌入次数 / 库膨胀百分比」对照——学习者一眼看见 overlap 的代价。
 *
 * 不调 LLM：纯本地文本操作，失败仅来自 Zod 校验（4xx）。
 *
 * 入参 body = { text, size }
 * 返回   = { ok: true, result: { size, rows: [{ overlapPercent, overlap, stats, embedCalls, libBloatPercent, chunks }] } }
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { compareOverlap } from "../lib/flow/chunk.js";

const bodySchema = z.object({
  text: z.string().min(1, "text 不能为空"),
  size: z.number().int().min(50).max(5000),
});

export function mountChunkCompareOverlap(router: Router): void {
  router.post("/api/chunk/compare-overlap", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法",
        issues: parsed.error.issues,
        hint: "text 必填；size 整数 50~5000。",
      };
      return;
    }
    const result = compareOverlap(parsed.data.text, parsed.data.size);
    ctx.body = { ok: true, result };
  });
}