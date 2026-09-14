/**
 * 职责：POST /api/dual-expansion-and-search，规则补词 + 模型补词 两路并列。
 * 数据流：body.query → dualExpansionAndRetrieve → JSON。route 不直接调模型。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { dualExpansionAndRetrieve } from "../lib/flow/dual-expansion.js";
import { llm } from "../lib/http/runtime-ctx.js";
import { sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
});

export function mountDualExpansionRoutes(router: Router): void {
  router.post("/api/dual-expansion-and-search", async (ctx: Context, _next: Next) => {
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      sendError(ctx, 400, "请求体需要字符串字段 query");
      return;
    }
    const query = parsed.data.query.trim();
    if (!query) {
      sendError(ctx, 400, "问句是空的。请填问句后再跑规则 vs 模型分列。");
      return;
    }
    if (!llm) {
      sendError(ctx, 503, "模型补词需要 LLM；当前没密钥。请在 apps/.env 配置后再跑。");
      return;
    }
    try {
      const result = await dualExpansionAndRetrieve(query, Boolean(llm));
      ctx.body = { ok: true, stage: "dual-expansion", ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 502, "规则 / 模型补词失败：" + message);
    }
  });
}
