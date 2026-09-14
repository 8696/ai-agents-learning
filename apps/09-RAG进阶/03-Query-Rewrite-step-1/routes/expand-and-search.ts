/**
 * 职责：POST /api/expand-and-search，本地规则补词 + 一次检索。
 * 数据流：body.query → expandAndRetrieve → JSON。route 不直接调模型。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { expandAndRetrieve } from "../lib/flow/expand-query.js";
import { sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
});

export function mountExpandAndSearchRoutes(router: Router): void {
  router.post("/api/expand-and-search", (ctx: Context, _next: Next) => {
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      sendError(ctx, 400, "请求体需要字符串字段 query");
      return;
    }
    const query = parsed.data.query.trim();
    if (!query) {
      sendError(ctx, 400, "问句是空的。请填用户原话后再扩展。");
      return;
    }
    const result = expandAndRetrieve(query);
    ctx.body = { ok: true, stage: "expanded", ...result };
  });
}
