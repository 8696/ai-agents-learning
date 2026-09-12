/**
 * 职责：把打分请求体校验成问题向量 + 卡片列表 + Top-K 的 K（可选）+ 阈值（可选）。
 *       三 mode 共享：raw（不传 k/threshold）/ topk（传 k）/ threshold（传 k + threshold）。
 *       缺字段用教学集；空列表 / K 越界 / 阈值非法当 400。
 *
 * 数据流：jsonBody → zod → { query, cards, k?, threshold? }；不合法 → ScoreInputError。
 */
import { z } from "zod";
import { ScoreInputError, TEACHING_CARDS, TEACHING_QUERY, type ScoreCard } from "../flow/score-vectors.js";

const VectorSchema = z.array(z.number().finite()).min(1);
const CardSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  text: z.string().min(1),
  vector: VectorSchema,
});
const BodySchema = z
  .object({
    query: z
      .object({
        label: z.string().min(1).optional(),
        text: z.string().min(1).optional(),
        vector: VectorSchema,
      })
      .optional(),
    cards: z.array(CardSchema).optional(),
    k: z.number().int().positive().optional(),
    threshold: z.number().finite().optional(),
  })
  .passthrough();

export function readScoreBody(raw: unknown): {
  query: { label: string; text: string; vector: number[] };
  cards: ScoreCard[];
  k: number | undefined;
  threshold: number | undefined;
} {
  const parsed = BodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new ScoreInputError("请求体必须是 JSON：可选 query.vector、可选 cards[]、可选 k（正整数）、可选 threshold（有限数）。");
  }
  if (parsed.data.cards && parsed.data.cards.length === 0) {
    throw new ScoreInputError("卡片列表（cards）是空的，没有可打分的向量。这是本页第一类失败：4xx。");
  }
  return {
    query: parsed.data.query
      ? {
          label: parsed.data.query.label ?? "自定义问题向量（query）",
          text: parsed.data.query.text ?? "（自定义问题，无原文）",
          vector: parsed.data.query.vector,
        }
      : TEACHING_QUERY,
    cards: parsed.data.cards ?? TEACHING_CARDS,
    k: parsed.data.k,
    threshold: parsed.data.threshold,
  };
}