/**
 * 职责：POST /api/retry-charge。charge_member_card 工具模拟超时，框架默认重试，
 *       展示「默默双扣」的可观察证据。
 *
 * 数据流：body.utterance → runRetryCharge → JSON。forceError=true 走 5xx。空字符串走 4xx。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { runRetryCharge } from "../lib/flow/retry-charge.js";
import { logger } from "../lib/logger.js";

const DEFAULT_UTTERANCE = "用会员卡支付这单。";

const bodySchema = z.object({
  utterance: z.string().optional(),
  forceError: z.boolean().optional(),
});

export function mountRetryChargeRoutes(router: Router): void {
  router.post("/api/retry-charge", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参不是合法 JSON 对象", issues: parsed.error.issues };
      return;
    }
    if (parsed.data.forceError) {
      ctx.status = 500;
      ctx.body = { ok: false, error: "演示后端 5xx：扣卡重试这一侧故意失败。" };
      return;
    }
    if (typeof parsed.data.utterance === "string" && parsed.data.utterance.trim() === "") {
      ctx.status = 400;
      ctx.body = { ok: false, error: "客人口述不能是空字符串。请用默认「用会员卡支付这单。」或自己写一句。" };
      return;
    }
    const utterance = parsed.data.utterance?.trim() || DEFAULT_UTTERANCE;
    try {
      const result = await runRetryCharge(utterance);
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("retry-charge.route", "结束：runRetryCharge（失败）", "扣卡重试抛错，返回 500。", {
        返回值: { message },
      });
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}