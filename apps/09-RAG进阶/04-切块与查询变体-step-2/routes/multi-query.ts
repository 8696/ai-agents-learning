/**
 * 职责：POST /api/multi-query，校验问句后跑多路查询主流程。
 * 数据流：jsonBody → Zod → multiQueryRetrieve → ctx.body。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { multiQueryRetrieve } from "../lib/flow/multi-query-retrieve.js";
import { sendError } from "../lib/http/send-error.js";
import { getLlmOptional } from "../../../llm.js";

const BodySchema = z.object({
  query: z.string(),
  topK: z.number().int().min(1).max(6).optional(),
  numQueries: z.number().int().min(1).max(5).optional(),
});

export function mountMultiQueryRoutes(router: Router): void {
  router.post("/api/multi-query", async (ctx: Context) => {
    const parsed = BodySchema.safeParse((ctx.request as { body?: unknown }).body);
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 query 字符串，可选 topK（1 到 6）、numQueries（1 到 5）。",
      });
      return;
    }
    const query = parsed.data.query.trim();
    if (!query) {
      sendError(ctx, 400, {
        error: "EMPTY_QUERY",
        explain: "问句是空的。请输入售后问题，例如「冬天杯子隔夜水还能喝吗」。",
      });
      return;
    }
    if (!getLlmOptional()) {
      sendError(ctx, 503, {
        error: "NO_KEY",
        explain: "apps/.env 里当前模型服务商还没有密钥，无法生成答复。",
      });
      return;
    }

    try {
      const result = await multiQueryRetrieve({
        query,
        topK: parsed.data.topK ?? 3,
        numQueries: parsed.data.numQueries ?? 3,
      });
      ctx.body = result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sendError(ctx, 502, {
        error: "LLM_FAILED",
        explain: `调用模型失败：${message}`,
      });
    }
  });
}