/**
 * 职责：POST /api/chunk/faq —— FAQ 切块（一问一答一块）。
 * 数据流：body = { text } → chunkByFaq → { chunks, stats }。
 *
 * 不调 LLM：纯本地文本操作，失败仅来自 Zod 校验（4xx）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { chunkByFaq } from "../lib/flow/chunk.js";

const bodySchema = z.object({
  text: z.string().min(1, "text 不能为空"),
});

export function mountChunkFaq(router: Router): void {
  router.post("/api/chunk/faq", (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = {
        ok: false,
        error: "入参不合法",
        issues: parsed.error.issues,
        hint: "text 必填。",
      };
      return;
    }
    const result = chunkByFaq(parsed.data.text);
    ctx.body = { ok: true, result };
  });
}