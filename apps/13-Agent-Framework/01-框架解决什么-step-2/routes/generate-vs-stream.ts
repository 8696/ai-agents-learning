/**
 * 职责：POST /api/generate-vs-stream。非流式 vs 流式子页：左栏发 mode=generate 走 generateText，
 *   右栏发 mode=stream 走 streamText。两侧独立 fetch、共享同一份拼装链（createModel）。
 *
 * 数据流：body.{ query, provider, protocol, mode } → runGenerateVsStream → ctx.res（JSON 或 UI 消息流）。
 *   provider ∈ PRODUCTION_PROVIDER_IDS；protocol ∈ "openai" | "anthropic"；
 *   mode ∈ "generate" | "stream"；
 *   入参校验失败 → 4xx { ok:false, issues }；服务起那一刻 client close → abort.abort()。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { PRODUCTION_PROVIDER_IDS } from "../../../llm.js";
import { runGenerateVsStream, type GenerateVsStreamMode } from "../lib/flow/generate-vs-stream.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  query: z.string().min(1).max(2000).optional(),
  provider: z.enum(PRODUCTION_PROVIDER_IDS).optional(),
  protocol: z.enum(["openai", "anthropic"]).optional(),
  mode: z.enum(["generate", "stream"]),
  messages: z.array(z.record(z.unknown())).optional(),
});

export function mountGenerateVsStreamRoutes(router: Router): void {
  router.post("/api/generate-vs-stream", async (ctx: Context) => {
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { ok: false, error: "入参缺字段 / 不在允许范围；generate 模式必填 query；stream 模式必填 messages（useChat 默认发 messages 数组）。", issues: parsed.error.issues };
      return;
    }
    const provider = parsed.data.provider ?? "minimax";
    const protocol = parsed.data.protocol ?? "openai";
    const mode: GenerateVsStreamMode = parsed.data.mode;
    const abort = new AbortController();
    ctx.req.on("close", () => abort.abort());
    ctx.respond = false;
    try {
      await runGenerateVsStream({
        providerId: provider,
        protocol,
        query: parsed.data.query,
        messages: parsed.data.messages as unknown as Parameters<typeof runGenerateVsStream>[0]["messages"],
        mode,
        response: ctx.res,
        abortSignal: abort.signal,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("generate-vs-stream.route", "结束：runGenerateVsStream（失败）", "推流 / JSON 失败；上面已经写过 500 头了。", {
        入参: { provider, protocol, mode, queryLen: parsed.data.query?.length ?? 0, messagesLen: parsed.data.messages?.length ?? 0 },
        返回值: { message },
      });
    }
  });
}