/**
 * 职责：POST /api/embed。向量化单条子页：调 embed({ value }) 把一段文字转成向量。
 *
 * 数据流：body.{ text, provider } → runEmbed → ctx.res（一次性 JSON）。
 *   provider ∈ PRODUCTION_PROVIDER_IDS；
 *   入参校验失败 → 4xx { ok:false, issues }；服务起那一刻 client close → abort.abort()。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { PRODUCTION_PROVIDER_IDS } from "../../../llm.js";
import { runEmbed } from "../lib/flow/embed.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  text: z.string().min(1).max(8000),
  provider: z.enum(PRODUCTION_PROVIDER_IDS).optional(),
});

export function mountEmbedRoutes(router: Router): void {
  router.post("/api/embed", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参缺 text 字段，或 text 为空；provider 不在 minimax | zhipu | deepseek | qwen 里。", issues: parsed.error.issues };
      return;
    }
    const provider = parsed.data.provider ?? "minimax";
    const abort = new AbortController();
    ctx.req.on("close", () => abort.abort());
    try {
      await runEmbed({
        providerId: provider,
        text: parsed.data.text,
        response: ctx.res,
        abortSignal: abort.signal,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("embed.route", "结束：runEmbed（失败）", "JSON 写响应失败；上面已经写过 500 头了。", {
        入参: { provider, textLen: parsed.data.text.length },
        返回值: { message },
      });
    }
  });
}