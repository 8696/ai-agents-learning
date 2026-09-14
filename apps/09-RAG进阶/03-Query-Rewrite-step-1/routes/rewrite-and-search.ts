/**
 * 职责：POST /api/rewrite-and-search，先改写再检索。不扫全库第二遍以外的通道。
 * 数据流：body.query → rewriteAndRetrieve → JSON。route 不直接调模型。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { rewriteAndRetrieve } from "../lib/flow/rewrite-and-retrieve.js";
import { llm } from "../lib/http/runtime-ctx.js";
import { sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
});

export function mountRewriteAndSearchRoutes(router: Router): void {
  router.post("/api/rewrite-and-search", async (ctx: Context, _next: Next) => {
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      sendError(ctx, 400, "请求体需要字符串字段 query");
      return;
    }
    const query = parsed.data.query.trim();
    if (!query) {
      sendError(ctx, 400, "问句是空的。请填用户原话后再改写。");
      return;
    }
    if (!llm) {
      sendError(ctx, 503, "当前模型服务商没有密钥。请在 apps/.env 配置后再改写。");
      return;
    }
    try {
      const result = await rewriteAndRetrieve(query);
      ctx.body = { ok: true, stage: "rewritten", ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 502, "改写模型调用失败：" + message);
    }
  });
}
