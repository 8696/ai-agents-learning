/**
 * 职责：POST /api/embed-many。向量化批量子页：调 embedMany({ values }) 把多条文字转成二维向量数组。
 *
 * 数据流：body.{ texts[], provider } → runEmbedMany → ctx.res（一次性 JSON）。
 *   provider ∈ PRODUCTION_PROVIDER_IDS；
 *   texts 元素数 1~200；
 *   入参校验失败 → 4xx { ok:false, issues }；服务起那一刻 client close → abort.abort()。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { PRODUCTION_PROVIDER_IDS } from "../../../llm.js";
import { runEmbedMany } from "../lib/flow/embed-many.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  texts: z.array(z.string().min(1).max(8000)).min(1).max(200),
  provider: z.enum(PRODUCTION_PROVIDER_IDS).optional(),
});

export function mountEmbedManyRoutes(router: Router): void {
  router.post("/api/embed-many", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参缺 texts 字段，或 texts 为空数组 / 元素数 > 200；provider 不在 minimax | zhipu | deepseek | qwen 里。", issues: parsed.error.issues };
      return;
    }
    const provider = parsed.data.provider ?? "minimax";
    const abort = new AbortController();
    ctx.req.on("close", () => abort.abort());
    try {
      await runEmbedMany({
        providerId: provider,
        texts: parsed.data.texts,
        response: ctx.res,
        abortSignal: abort.signal,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("embed-many.route", "结束：runEmbedMany（失败）", "JSON 写响应失败；上面已经写过 500 头了。", {
        入参: { provider, count: parsed.data.texts.length },
        返回值: { message },
      });
    }
  });
}