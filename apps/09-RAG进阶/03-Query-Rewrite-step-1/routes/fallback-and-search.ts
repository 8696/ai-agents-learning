/**
 * 职责：POST /api/fallback-and-search，调改写失败 → 用原句兜底继续检索；body.forceError=true 强制触发失败。
 * 数据流：body.{query, forceError?} → fallbackAndRetrieve → JSON。route 不直接调模型。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { fallbackAndRetrieve } from "../lib/flow/fallback-and-retrieve.js";
import { sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
  forceError: z.boolean().optional(),
});

export function mountFallbackAndSearchRoutes(router: Router): void {
  router.post("/api/fallback-and-search", async (ctx: Context, _next: Next) => {
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      sendError(ctx, 400, "请求体需要字符串字段 query（forceError 可选）");
      return;
    }
    const query = parsed.data.query.trim();
    if (!query) {
      sendError(ctx, 400, "问句是空的。请填问句后再跑兜底。");
      return;
    }
    try {
      const result = await fallbackAndRetrieve(query, { forceError: parsed.data.forceError });
      ctx.body = { ok: true, stage: "fallback", ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 500, "兜底逻辑本身失败：" + message);
    }
  });
}
