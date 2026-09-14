/**
 * 职责：POST /api/drift-and-search，模拟改写改偏 —— 按用户传的 forcedRewrittenQuery 检索，同时返回原句名单。
 * 数据流：body.{query, forcedRewrittenQuery, driftReason} → driftAndRetrieve → JSON。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { driftAndRetrieve } from "../lib/flow/drift-and-retrieve.js";
import { sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
  forcedRewrittenQuery: z.string(),
  driftReason: z.string().optional(),
});

export function mountDriftAndSearchRoutes(router: Router): void {
  router.post("/api/drift-and-search", (ctx: Context, _next: Next) => {
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      sendError(ctx, 400, "请求体需要字符串字段 query + forcedRewrittenQuery（driftReason 可选）");
      return;
    }
    const query = parsed.data.query.trim();
    const forced = parsed.data.forcedRewrittenQuery.trim();
    if (!query || !forced) {
      sendError(ctx, 400, "query 和 forcedRewrittenQuery 都不能为空");
      return;
    }
    const driftReason = (parsed.data.driftReason || "未说明原因").trim();
    const result = driftAndRetrieve(query, forced, driftReason);
    ctx.body = { ok: true, stage: "drift", ...result };
  });
}
