/**
 * 职责：POST /api/residual-and-search，多轮指代改写 —— 残句补全成独立问句 + 改写后检索。
 * 数据流：body.{query, history} → residualAndRetrieve → JSON。route 不直接调模型。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { residualAndRetrieve } from "../lib/flow/residual-and-retrieve.js";
import { llm } from "../lib/http/runtime-ctx.js";
import { sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .optional(),
});

export function mountResidualAndSearchRoutes(router: Router): void {
  router.post("/api/residual-and-search", async (ctx: Context, _next: Next) => {
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      sendError(ctx, 400, "请求体需要字符串字段 query（history 可选）");
      return;
    }
    const query = parsed.data.query.trim();
    if (!query) {
      sendError(ctx, 400, "当前问句是空的。");
      return;
    }
    if (!llm) {
      sendError(ctx, 503, "当前模型服务商没有密钥。请在 apps/.env 配置后再跑残句补全。");
      return;
    }
    try {
      const history = parsed.data.history || [];
      const result = await residualAndRetrieve(query, history, Boolean(llm));
      ctx.body = { ok: true, stage: "residual", ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 502, "residual-and-search 失败：" + message);
    }
  });
}
