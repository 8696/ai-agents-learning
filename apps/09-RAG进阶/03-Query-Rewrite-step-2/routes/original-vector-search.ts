/**
 * 职责：POST /api/original-vector-search，对照路径 —— 原句直接嵌入 + 余弦检索，不经假想段。
 * 数据流：body.query → originalEmbedAndRetrieve → JSON。
 */
import type { Context, Next } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { originalEmbedAndRetrieve } from "../lib/flow/hyde-and-retrieve.js";
import { llm } from "../lib/http/runtime-ctx.js";
import { sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
});

export function mountOriginalVectorSearchRoutes(router: Router): void {
  router.post("/api/original-vector-search", async (ctx: Context, _next: Next) => {
    const parsed = bodySchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      sendError(ctx, 400, "请求体需要字符串字段 query");
      return;
    }
    const query = parsed.data.query.trim();
    if (!query) {
      sendError(ctx, 400, "问句是空的。请填问句后再跑对照检索。");
      return;
    }
    if (!llm) {
      sendError(ctx, 503, "当前模型服务商没有密钥。请在 apps/.env 配置后再跑嵌入检索。");
      return;
    }
    if (!llm.embeddingModel) {
      sendError(
        ctx,
        503,
        "当前提供商没配置嵌入模型（Embedding Model）。填 LLM_EMBEDDING_MODEL，或把 LLM_PROVIDER 换成 minimax / zhipu / qwen。",
      );
      return;
    }
    try {
      const result = await originalEmbedAndRetrieve(query);
      ctx.body = { ok: true, stage: "original-vector", ...result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 502, "原句嵌入检索失败：" + message);
    }
  });
}