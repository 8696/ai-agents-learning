/**
 * 职责：POST /api/agent-loop。工具调用循环子页：注册 mock 工具（readMenu / makeLatte），
 *   按 mode 调 streamText({ tools, stopWhen }) → 推 UI 消息流给浏览器拆帧。
 *
 * 数据流：body.{ query, provider, protocol, mode } → pipeAgentLoop → ctx.res（流式 UI 消息流）。
 *   provider ∈ PRODUCTION_PROVIDER_IDS；protocol ∈ "openai" | "anthropic"；
 *   mode ∈ "default" | "stopWhen3"；
 *   入参校验失败 → 4xx { ok:false, issues }；服务起那一刻 client close → abort.abort()。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { PRODUCTION_PROVIDER_IDS } from "../../../llm.js";
import { pipeAgentLoop, type AgentLoopMode } from "../lib/flow/agent-loop.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  query: z.string().min(1).max(2000),
  provider: z.enum(PRODUCTION_PROVIDER_IDS).optional(),
  protocol: z.enum(["openai", "anthropic"]).optional(),
  mode: z.enum(["default", "stopWhen3"]).optional(),
});

export function mountAgentLoopRoutes(router: Router): void {
  router.post("/api/agent-loop", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参缺 query 字段，或 query 为空；provider 不在 minimax | zhipu | deepseek | qwen 里；protocol 不在 openai | anthropic 里；mode 不在 default | stopWhen3 里。", issues: parsed.error.issues };
      return;
    }
    const provider = parsed.data.provider ?? "minimax";
    const protocol = parsed.data.protocol ?? "openai";
    const mode: AgentLoopMode = parsed.data.mode ?? "default";
    const abort = new AbortController();
    ctx.req.on("close", () => abort.abort());
    ctx.respond = false;
    try {
      await pipeAgentLoop(parsed.data.query, provider, protocol, mode, ctx.res, abort.signal);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("agent-loop.route", "结束：pipeAgentLoop（失败）", "推流失败。", {
        入参: { provider, protocol, mode, queryLen: parsed.data.query.length },
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