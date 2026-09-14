/**
 * 职责：POST /api/listwise-shape。走「专用重排序接口」形状（mock 实现）。
 * 数据流：问句 + documents[]（[{id, title, text}, ...]）→ mock 出 { results: [{id, score}, ...] } → 按 score 排序 → orderedIds。
 * 为什么 mock：本仓库不接真 Cohere / Jina 密钥；这一步教学点是「请求 / 响应形状对得上业界协议」，不是真调。
 */
import type { Context } from "koa";
import Router from "@koa/router";
import { z } from "zod";
import { rerankViaShape } from "../lib/flow/listwise-shape.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";

const bodySchema = z.object({
  query: z.string(),
  documents: z.array(z.object({
    id: z.string(),
    title: z.string(),
    text: z.string(),
  })).min(1),
});

export function mountListwiseShape(router: Router): void {
  router.post("/api/listwise-shape", (ctx: Context) => {
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, "请求体对不上", "需要 query、documents[]（每项含 id / title / text）");
      }
      const query = parsed.data.query.trim();
      if (!query) {
        throw new HttpError(400, "问句是空的", "专用接口也得带问句");
      }
      const result = rerankViaShape(query, parsed.data.documents);
      ctx.body = { ok: true, ...result };
    } catch (error: unknown) {
      sendError(ctx, error);
    }
  });
}