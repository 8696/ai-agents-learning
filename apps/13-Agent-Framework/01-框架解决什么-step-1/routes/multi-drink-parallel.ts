/**
 * 职责：POST /api/multi-drink-parallel。一次 generateText；模型一次返回 2 个 tool_calls；SDK 默认并行执行。
 *
 * 数据流：无 body（query 固定为「热美式和冰拿铁各来一杯」）；forceError=true 走 5xx。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { runMultiDrinkParallel } from "../lib/flow/multi-drink.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  forceError: z.boolean().optional(),
});

export function mountMultiDrinkParallelRoutes(router: Router): void {
  router.post("/api/multi-drink-parallel", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参不是合法 JSON 对象", issues: parsed.error.issues };
      return;
    }
    if (parsed.data.forceError) {
      ctx.status = 500;
      ctx.body = { ok: false, error: "演示后端 5xx：并行这一侧故意失败。" };
      return;
    }
    try {
      const result = await runMultiDrinkParallel();
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("multi-drink-parallel.route", "结束：runMultiDrinkParallel（失败）", "并行抛错，返回 500。", {
        返回值: { message },
      });
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}