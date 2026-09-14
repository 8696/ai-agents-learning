/**
 * 职责：倒数排名融合（Reciprocal Rank Fusion，RRF）—— 多路名单合并工具。
 * rrfScore(d) = Σ 1 / (k + rank_in_route)；被多路共同命中的切块往上抬。
 * k 取 60 是 BM25 / 多数向量库的常用默认值。
 */
import { logger } from "../logger.js";
import type { ScoredChild } from "../corpus/score-children.js";

export function rrfMerge(perQueryHits: ScoredChild[][], k: number = 60): ScoredChild[] {
  const started = Date.now();
  logger.info(
    "rrfMerge",
    "调用函数开始：rrfMerge",
    "为什么：多路名单合并——被多路共同命中的切块往上抬；避免单一邻域漏召回。",
    {
      __code: rrfMerge.toString(),
      入参: { routeCount: perQueryHits.length, k },
    },
  );

  const scoreMap = new Map<string, { hit: ScoredChild; rrfScore: number }>();
  for (const route of perQueryHits) {
    route.forEach((hit, idx) => {
      const rank = idx + 1;
      const contribution = 1 / (k + rank);
      const existing = scoreMap.get(hit.id);
      if (existing) {
        existing.rrfScore += contribution;
      } else {
        scoreMap.set(hit.id, { hit, rrfScore: contribution });
      }
    });
  }
  const merged = Array.from(scoreMap.values())
    .sort((a, b) => b.rrfScore - a.rrfScore || a.hit.id.localeCompare(b.hit.id))
    .map((item) => ({ ...item.hit, score: item.rrfScore }));

  logger.info(
    "rrfMerge",
    "调用函数结束：rrfMerge",
    "为什么：RRF 分数按名次倒数累加；被多路都捞到的分高。当前：合并完成。",
    {
      返回值: merged,
      耗时ms: Date.now() - started,
    },
  );

  return merged;
}