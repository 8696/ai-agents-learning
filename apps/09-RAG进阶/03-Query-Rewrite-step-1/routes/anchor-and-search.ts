/**
 * 职责：POST /api/anchor-and-search，先检测锚点（SKU / 条款 / Section），
 *       命中 → 跳过改写、原句直搜；未命中 → 走改写后检索。
 * 数据流：body.query → anchorAndRetrieve → JSON。route 不直接调模型。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { anchorAndRetrieve } from "../lib/flow/anchor-and-retrieve.js";
import { llm } from "../lib/http/runtime-ctx.js";
import { sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
});

export function mountAnchorAndSearchRoutes(router: Router): void {
  router.post("/api/anchor-and-search", async (ctx: Context, _next: Next) => {
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      sendError(ctx, 400, "请求体需要字符串字段 query");
      return;
    }
    const query = parsed.data.query.trim();
    if (!query) {
      sendError(ctx, 400, "问句是空的。请填问句后再跑锚点检测。");
      return;
    }
    try {
      const result = await anchorAndRetrieve(query, Boolean(llm));
      ctx.body = { ok: true, stage: "anchor", ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 502, "锚点检测 / 改写失败：" + message);
    }
  });
}
