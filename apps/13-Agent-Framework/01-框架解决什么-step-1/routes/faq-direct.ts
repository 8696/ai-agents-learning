/**
 * 职责：POST /api/faq-direct。FAQ 问句直接调模型，不带 tools。
 *
 * 数据流：body.utterance → runFaqDirect → JSON。forceError=true 走 5xx。空字符串走 4xx。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { DEFAULT_UTTERANCE } from "../lib/cafe/cafe-shared.js";
import { runFaqDirect } from "../lib/flow/faq.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  utterance: z.string().optional(),
  forceError: z.boolean().optional(),
});

export function mountFaqDirectRoutes(router: Router): void {
  router.post("/api/faq-direct", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参不是合法 JSON 对象", issues: parsed.error.issues };
      return;
    }
    if (parsed.data.forceError) {
      ctx.status = 500;
      ctx.body = { ok: false, error: "演示后端 5xx：直接调这一侧故意失败，对照空输入的 4xx。" };
      return;
    }
    if (typeof parsed.data.utterance === "string" && parsed.data.utterance.trim() === "") {
      ctx.status = 400;
      ctx.body = { ok: false, error: "客人口述不能是空字符串。请用默认「吧台能做什么咖啡？」或自己写一句。" };
      return;
    }
    const utterance = parsed.data.utterance?.trim() || DEFAULT_UTTERANCE;
    try {
      const result = await runFaqDirect(utterance);
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("faq-direct.route", "结束：runFaqDirect（失败）", "直接调抛错，返回 500。", {
        返回值: { message },
      });
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}