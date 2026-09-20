/**
 * 职责：POST /api/reasoning-openai。OpenAI 协议下推理提取。
 *
 * 数据流：body.{ query, provider } → pipeReasoning(..., "openai") → ctx.res。
 *   provider ∈ PRODUCTION_PROVIDER_IDS；该家没在 .env 配齐 → 4xx { ok:false, reason }。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { PRODUCTION_PROVIDER_IDS } from "../../../llm.js";
import { pipeReasoning } from "../lib/flow/reasoning.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  query: z.string().min(1).max(2000),
  provider: z.enum(PRODUCTION_PROVIDER_IDS).optional(),
});

export function mountReasoningOpenAiRoutes(router: Router): void {
  router.post("/api/reasoning-openai", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参缺 query 字段，或 query 为空；provider 不在 minimax | zhipu | deepseek | qwen 里。", issues: parsed.error.issues };
      return;
    }
    const provider = parsed.data.provider ?? "minimax";
    const abort = new AbortController();
    ctx.req.on("close", () => abort.abort());
    ctx.respond = false;
    try {
      await pipeReasoning(parsed.data.query, provider, "openai", ctx.res, abort.signal);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("reasoning.route.openai", "结束：pipeReasoning（失败）", "推流失败。", {
        入参: { provider, queryLen: parsed.data.query.length },
        返回值: { message },
      });
      if (!ctx.res.headersSent) {
        ctx.res.statusCode = 500;
        ctx.res.setHeader("Content-Type", "application/json; charset=utf-8");
        ctx.res.end(JSON.stringify({ ok: false, error: message }));
      } else {
        ctx.res.end();
      }
    }
  });
}