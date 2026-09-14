/**
 * 职责：POST /api/generate，拼 prompt + 调 LLM 答。
 * 数据流：body = { query, retrievalMode } → runGenerate → JSON。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { runGenerate } from "../lib/flow/generate.js";
import { llm } from "../lib/http/runtime-ctx.js";
import { sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
  retrievalMode: z.enum(["original", "rewritten"]).optional(),
});

export function mountGenerateRoutes(router: Router): void {
  router.post("/api/generate", async (ctx: Context, _next: Next) => {
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      sendError(ctx, 400, "请求体需要字符串字段 query（retrievalMode 可选：original / rewritten）");
      return;
    }
    const query = parsed.data.query.trim();
    if (!query) {
      sendError(ctx, 400, "问句是空的。请填问句后再跑生成。");
      return;
    }
    if (!llm) {
      sendError(ctx, 503, "当前模型服务商没有密钥。请在 apps/.env 配置后再跑生成。");
      return;
    }
    const retrievalMode = parsed.data.retrievalMode ?? "rewritten";
    try {
      const result = await runGenerate(query, retrievalMode);
      ctx.body = { ok: true, stage: "generate", ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 502, "跑生成失败：" + message);
    }
  });
}