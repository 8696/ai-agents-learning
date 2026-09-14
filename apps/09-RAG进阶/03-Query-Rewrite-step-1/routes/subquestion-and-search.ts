/**
 * 职责：POST /api/subquestion-and-search，一问多句拆子问题 + 各自检索 + 合并名单。
 * 数据流：body.query → subquestionAndRetrieve → JSON。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { subquestionAndRetrieve } from "../lib/flow/subquestion-and-retrieve.js";
import { llm } from "../lib/http/runtime-ctx.js";
import { sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
});

export function mountSubquestionAndSearchRoutes(router: Router): void {
  router.post("/api/subquestion-and-search", async (ctx: Context, _next: Next) => {
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      sendError(ctx, 400, "请求体需要字符串字段 query");
      return;
    }
    const query = parsed.data.query.trim();
    if (!query) {
      sendError(ctx, 400, "问句是空的。请填一句多问的问句后再拆。");
      return;
    }
    if (!llm) {
      sendError(ctx, 503, "拆子问题需要 LLM；当前没密钥。请在 apps/.env 配置后再跑。");
      return;
    }
    try {
      const result = await subquestionAndRetrieve(query, Boolean(llm));
      ctx.body = { ok: true, stage: "subquestion", ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 502, "拆子问题失败：" + message);
    }
  });
}
