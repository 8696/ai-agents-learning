/**
 * 职责：POST /api/multi-drink-serial。分 2 次 generateText，每轮只做 1 杯，强制串行。
 *
 * 数据流：无 body；forceError=true 走 5xx。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { runMultiDrinkSerial } from "../lib/flow/multi-drink.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  forceError: z.boolean().optional(),
});

export function mountMultiDrinkSerialRoutes(router: Router): void {
  router.post("/api/multi-drink-serial", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参不是合法 JSON 对象", issues: parsed.error.issues };
      return;
    }
    if (parsed.data.forceError) {
      ctx.status = 500;
      ctx.body = { ok: false, error: "演示后端 5xx：串行这一侧故意失败。" };
      return;
    }
    try {
      const result = await runMultiDrinkSerial();
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("multi-drink-serial.route", "结束：runMultiDrinkSerial（失败）", "串行抛错，返回 500。", {
        返回值: { message },
      });
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}