/**
 * 职责：POST /api/pairwise。一次请求只问 A vs B 谁更该回答当前问句。
 * 数据流：问句 + idA + idB → 调一次对话补全 → 解析 winner: "A" | "B" → 校验。
 */
import type { Context } from "koa";
import Router from "@koa/router";
import { z } from "zod";
import { comparePair } from "../lib/flow/pairwise.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
  idA: z.string(),
  idB: z.string(),
});

export function mountPairwise(router: Router): void {
  router.post("/api/pairwise", async (ctx: Context) => {
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, "请求体对不上", "需要 query、idA、idB");
      }
      const query = parsed.data.query.trim();
      if (!query) {
        throw new HttpError(400, "问句是空的", "Pairwise 也得带问句");
      }
      if (parsed.data.idA === parsed.data.idB) {
        throw new HttpError(400, "idA 与 idB 不能相同", "Pairwise 是两条不同切块的比较");
      }
      const result = await comparePair(query, parsed.data.idA, parsed.data.idB);
      ctx.body = { ok: true, ...result };
    } catch (error: unknown) {
      sendError(ctx, error);
    }
  });
}