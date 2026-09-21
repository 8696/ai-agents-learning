/**
 * 职责：POST /api/faq-agent。FAQ 问句套框架 Agent，带 make_latte 工具。
 *
 * 数据流：body.utterance → runFaqAgent → JSON。forceError=true 走 5xx。空字符串走 4xx。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { DEFAULT_UTTERANCE } from "../lib/cafe/cafe-shared.js";
import { runFaqAgent } from "../lib/flow/faq.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  utterance: z.string().optional(),
  forceError: z.boolean().optional(),
});

export function mountFaqAgentRoutes(router: Router): void {
  router.post("/api/faq-agent", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参不是合法 JSON 对象", issues: parsed.error.issues };
      return;
    }
    if (parsed.data.forceError) {
      ctx.status = 500;
      ctx.body = { ok: false, error: "演示后端 5xx：套框架 Agent 这一侧故意失败，对照空输入的 4xx。" };
      return;
    }
    if (typeof parsed.data.utterance === "string" && parsed.data.utterance.trim() === "") {
      ctx.status = 400;
      ctx.body = { ok: false, error: "客人口述不能是空字符串。请用默认「吧台能做什么咖啡？」或自己写一句。" };
      return;
    }
    const utterance = parsed.data.utterance?.trim() || DEFAULT_UTTERANCE;
    try {
      const result = await runFaqAgent(utterance);
      ctx.body = { ok: true, result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("faq-agent.route", "结束：runFaqAgent（失败）", "套框架 Agent 抛错，返回 500。", {
        返回值: { message },
      });
      ctx.status = 500;
      ctx.body = { ok: false, error: message };
    }
  });
}