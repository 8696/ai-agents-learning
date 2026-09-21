/**
 * 职责：POST /api/allergy-gate。make_latte 网关版；allergy=true → 网关拒绝执行。
 *
 * 数据流：body.utterance + body.allergy → runAllergyGate → JSON。
 *         forceError=true 走 5xx。空字符串走 4xx。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { runAllergyGate } from "../lib/flow/allergy-gate.js";
import { logger } from "../lib/logger.js";

const DEFAULT_UTTERANCE = "我牛奶过敏，来一杯中杯拿铁。";

const bodySchema = z.object({
  utterance: z.string().optional(),
  allergy: z.boolean().optional(),
  forceError: z.boolean().optional(),
});

export function mountAllergyGateRoutes(router: Router): void {
  router.post("/api/allergy-gate", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参不是合法 JSON 对象", issues: parsed.error.issues };
      return;
    }
    if (parsed.data.forceError) {
      ctx.status = 500;
      ctx.body = { ok: false, error: "演示后端 5xx：过敏网关这一侧故意失败。" };
      return;
    }
    if (typeof parsed.data.utterance === "string" && parsed.data.utterance.trim() === "") {
      ctx.status = 400;
      ctx.body = { ok: false, error: "客人口述不能是空字符串。请用默认「我牛奶过敏，来一杯中杯拿铁。」或自己写一句。" };
      return;
    }
    const utterance = parsed.data.utterance?.trim() || DEFAULT_UTTERANCE;
    const allergy = parsed.data.allergy ?? true; // 默认 true（默认场景是过敏被拦）
    try {
      const result = await runAllergyGate(utterance, { allergy });
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("allergy-gate.route", "结束：runAllergyGate（失败）", "过敏网关抛错，返回 500。", {
        返回值: { message },
      });
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}