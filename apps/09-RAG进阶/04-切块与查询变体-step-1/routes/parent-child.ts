/**
 * 职责：POST /api/parent-child，校验问句后跑父子检索主流程。
 * 数据流：jsonBody → Zod → parentChildRetrieve → ctx.body。
 */
import { z } from "zod";
import type { Context } from "koa";
import type Router from "@koa/router";
import { parentChildRetrieve } from "../lib/flow/parent-child-retrieve.js";
import { jsonBody, sendError } from "../lib/http/send-error.js";
import { getLlmOptional } from "../../../llm.js";

const BodySchema = z.object({
  query: z.string(),
  topK: z.number().int().min(1).max(6).optional(),
});

export function mountParentChildRoutes(router: Router): void {
  router.post("/api/parent-child", async (ctx: Context) => {
    const parsed = BodySchema.safeParse(jsonBody(ctx));
    if (!parsed.success) {
      sendError(ctx, 400, {
        error: "BAD_BODY",
        explain: "请求体要有 query 字符串，可选 topK（1 到 6）。",
      });
      return;
    }
    const query = parsed.data.query.trim();
    if (!query) {
      sendError(ctx, 400, {
        error: "EMPTY_QUERY",
        explain: "问句是空的。请输入售后问题，例如「杯子运输途中裂了怎么办」。",
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
      const result = await parentChildRetrieve({
        query,
        topK: parsed.data.topK ?? 3,
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
