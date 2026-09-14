/**
 * 职责：POST /api/listwise-llm。走对话模型（OpenAI Chat Completions 协议 A）。
 * 数据流：问句 + 候选 id[] → 按 id 取正文 → 调一次对话补全 → 解析 orderedIds → 校验。
 */
import type { Context } from "koa";
import Router from "@koa/router";
import { z } from "zod";
import { rerankListwiseLlm } from "../lib/flow/listwise.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
  candidateIds: z.array(z.string()).min(1),
});

export function mountListwiseLlm(router: Router): void {
  router.post("/api/listwise-llm", async (ctx: Context) => {
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, "请求体对不上", "需要 query、candidateIds");
      }
      const query = parsed.data.query.trim();
      if (!query) {
        throw new HttpError(400, "问句是空的", "Listwise 必须带着原来那句问话");
      }
      const result = await rerankListwiseLlm(query, parsed.data.candidateIds);
      ctx.body = { ok: true, ...result };
    } catch (error: unknown) {
      sendError(ctx, error);
    }
  });
}