/**
 * 职责：POST /api/search-original，只用用户原句做词重叠检索，不改写、不调模型。
 * 数据流：body.query → retrieveByQuery → JSON。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { retrieveByQuery } from "../lib/flow/rewrite-and-retrieve.js";
import { sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
});

export function mountSearchOriginalRoutes(router: Router): void {
  router.post("/api/search-original", (ctx: Context, _next: Next) => {
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      sendError(ctx, 400, "请求体需要字符串字段 query");
      return;
    }
    const query = parsed.data.query.trim();
    if (!query) {
      sendError(ctx, 400, "问句是空的。请填用户原话后再检索。");
      return;
    }
    const retrieve = retrieveByQuery(query);
    ctx.body = { ok: true, stage: "original", retrieve };
  });
}
