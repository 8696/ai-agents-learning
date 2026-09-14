/**
 * 职责：POST /api/token-estimate。本地粗估 token 数（不调 LLM，不引 tokenizer）。
 * 数据流：问句 + 候选 id[] → 按 id 取正文 → 用 text.length / 1.5 估算 → 算多塞 vs 少塞。
 * 为什么单独成文件：本步教学点是「多塞 20 条 vs 精排后塞 5 条」的量级对照，
 *   单独成 route = 单独可观察，不污染 /api/recall 和 /api/rerank 的主路径。
 */
import type { Context } from "koa";
import Router from "@koa/router";
import { z } from "zod";
import { getChunkById } from "../lib/corpus/knowledge-base.js";
import { HttpError, jsonBody, sendError } from "../lib/http/send-error.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  query: z.string(),
  candidateIds: z.array(z.string()).min(1),
  rerankTopIds: z.array(z.string()).min(1),
});

/**
 * 中文为主的售后切块，约 1.5 字节/token（汉字 2 字节/token、ASCII 1 字符 0.25 字节/token
 * 混合后的常见加权）。这只是量级对照，不是精确计费。
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 1.5);
}

export function mountTokenEstimate(router: Router): void {
  router.post("/api/token-estimate", (ctx: Context) => {
    try {
      const parsed = bodySchema.safeParse(jsonBody(ctx));
      if (!parsed.success) {
        throw new HttpError(400, "请求体对不上", "需要 query、candidateIds（召回名单）、rerankTopIds（精排后前 K）");
      }
      const query = parsed.data.query.trim();
      if (!query) {
        throw new HttpError(400, "问句是空的", "没有问句就没法估算提示词大小");
      }

      const t0 = Date.now();
      const queryTokens = estimateTokens(query);

      const allRows = parsed.data.candidateIds.map((id) => {
        const chunk = getChunkById(id);
        return chunk
          ? { id, title: chunk.title, text: chunk.text, tokens: estimateTokens(chunk.text) }
          : { id, title: id, text: "", tokens: 0 };
      });
      const allTokens = allRows.reduce((sum, row) => sum + row.tokens, 0);

      const rerankRows = parsed.data.rerankTopIds
        .map((id) => allRows.find((row) => row.id === id))
        .filter((row): row is { id: string; title: string; text: string; tokens: number } => Boolean(row));
      const rerankTokens = rerankRows.reduce((sum, row) => sum + row.tokens, 0);

      const result = {
        query,
        queryTokens,
        allRows,
        allTokens,
        allCount: allRows.length,
        rerankRows,
        rerankTokens,
        rerankCount: rerankRows.length,
        delta: {
          tokens: allTokens - rerankTokens,
          count: allRows.length - rerankRows.length,
        },
      };

      logger.info(
        "调用函数-tokenEstimate",
        "调用函数结束：tokenEstimate",
        "为什么写这条日志：粗估 token 数让页面看见多塞 vs 少塞的量级。当前：本步不调 LLM。",
        { 入参: { query, candidateIds: parsed.data.candidateIds, rerankTopIds: parsed.data.rerankTopIds }, 返回值: result, 耗时ms: Date.now() - t0 },
      );

      ctx.body = { ok: true, ...result };
    } catch (error: unknown) {
      sendError(ctx, error);
    }
  });
}
