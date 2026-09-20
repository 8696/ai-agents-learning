/**
 * 职责：POST /api/structured。结构化输出子页：调 generateObject + zodSchema，把模型回答强约束成 JSON。
 *
 * 数据流：body.{ query, provider, protocol } → pipeStructured(...) → ctx.res（一次性 JSON）。
 *   provider ∈ PRODUCTION_PROVIDER_IDS；protocol ∈ "openai" | "anthropic"；
 *   provider / protocol 不在枚举里 → 4xx { ok:false, issues }。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { PRODUCTION_PROVIDER_IDS } from "../../../llm.js";
import { pipeStructured } from "../lib/flow/structured.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  query: z.string().min(1).max(2000),
  provider: z.enum(PRODUCTION_PROVIDER_IDS).optional(),
  protocol: z.enum(["openai", "anthropic"]).optional(),
});

export function mountStructuredRoutes(router: Router): void {
  router.post("/api/structured", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参缺 query 字段，或 query 为空；provider 不在 minimax | zhipu | deepseek | qwen 里；protocol 不在 openai | anthropic 里。", issues: parsed.error.issues };
      return;
    }
    const provider = parsed.data.provider ?? "minimax";
    const protocol = parsed.data.protocol ?? "openai";
    const abort = new AbortController();
    ctx.req.on("close", () => abort.abort());
    try {
      await pipeStructured(parsed.data.query, provider, protocol, ctx.res, abort.signal);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("structured.route", "结束：pipeStructured（失败）", "JSON 写响应失败；上面已经写过 500 头了。", {
        入参: { provider, protocol, queryLen: parsed.data.query.length },
        返回值: { message },
      });
      // pipeStructured 内部已经写完 500 响应头；这里只是补一刀 logger。
    }
  });
}
