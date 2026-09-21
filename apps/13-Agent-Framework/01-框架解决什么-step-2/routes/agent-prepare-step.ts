/**
 * 职责：POST /api/agent-prepare-step。工具渐进子页：按 mode 决定 streamText 是否带 prepareStep，
 *   step 0（第一步）只给只读工具，step 1（第二步）才解锁写工具。
 *
 * 数据流：body.{ query, provider, protocol, mode } → pipeAgentPrepareStep → ctx.res（流式 UI 消息流）。
 *   provider ∈ PRODUCTION_PROVIDER_IDS；protocol ∈ "openai" | "anthropic"；
 *   mode ∈ "baseline" | "progressive"；
 *   入参校验失败 → 4xx { ok:false, issues }；服务起那一刻 client close → abort.abort()。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { PRODUCTION_PROVIDER_IDS } from "../../../llm.js";
import { pipeAgentPrepareStep } from "../lib/flow/agent-prepare-step.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  query: z.string().min(1).max(2000),
  provider: z.enum(PRODUCTION_PROVIDER_IDS).optional(),
  protocol: z.enum(["openai", "anthropic"]).optional(),
});

export function mountAgentPrepareStepRoutes(router: Router): void {
  router.post("/api/agent-prepare-step", async (ctx: Context) => {
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
    ctx.respond = false;
    try {
      await pipeAgentPrepareStep(parsed.data.query, provider, protocol, ctx.res, abort.signal);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("agent-prepare-step.route", "结束：pipeAgentPrepareStep（失败）", "推流失败。", {
        入参: { provider, protocol, queryLen: parsed.data.query.length },
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