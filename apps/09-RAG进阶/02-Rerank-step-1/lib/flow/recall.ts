/**
 * 职责：粗召回（First-stage Retrieval）。从整库捞 N 条候选。
 * 数据流：问句 → 只数政策热词 → 按分排序 → 截前 N 条。
 * 本步核心不在这里；这里只负责「谁有资格上桌」。
 */
import { CORPUS, COARSE_HINTS, type KnowledgeChunk } from "../corpus/knowledge-base.js";
import { logger } from "../logger.js";

export type RecalledRow = {
  chunk: KnowledgeChunk;
  recallRank: number;
  coarseScore: number;
  hits: string[];
};

export type RecallResult = {
  query: string;
  limit: number;
  rows: RecalledRow[];
  leftOut: Array<{ id: string; title: string; coarseScore: number }>;
};

function countNeedle(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let from = 0;
  while (from <= haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    n += 1;
    from = at + needle.length;
  }
  return n;
}

function scoreCoarse(query: string, text: string): { score: number; hits: string[] } {
  const compact = query.replace(/\s/g, "");
  const hits: string[] = [];
  let score = 0;

  if (compact.includes("退")) {
    for (const word of COARSE_HINTS.退) {
      const n = countNeedle(text, word);
      if (n > 0) {
        const weight = word === "退款" ? 1 : 2;
        score += n * weight;
        hits.push(`${word}×${n}`);
      }
    }
  }
  if (compact.includes("天") || compact.includes("7") || compact.includes("七")) {
    for (const word of COARSE_HINTS.天) {
      const n = countNeedle(text, word);
      if (n > 0) {
        const weight = word === "十五天" ? 1 : 3;
        score += n * weight;
        hits.push(`${word}×${n}`);
      }
    }
  }
  return { score, hits };
}

/**
 * 从整库捞前 limit 条。不看「没拆 / 未拆封」，所以特例切块会上桌但通常不在最前。
 */
export function recallCandidates(query: string, limit: number): RecallResult {
  const t0 = Date.now();
  logger.info(
    "调用函数-recallCandidates",
    "调用函数开始：recallCandidates",
    "为什么写这条日志：第一阶段要从整库捞候选，不在这里改最终顺序。当前：马上按政策热词给每个切块打粗分。",
    {
      入参: { query, limit },
      __code: "const scored = CORPUS.map(...scoreCoarse); 按 coarseScore 降序截前 limit 条",
    },
  );

  const scored = CORPUS.map((chunk) => {
    const { score, hits } = scoreCoarse(query, chunk.text);
    return { chunk, coarseScore: score, hits };
  });
  scored.sort((a, b) => b.coarseScore - a.coarseScore || a.chunk.id.localeCompare(b.chunk.id));

  const kept = scored.slice(0, limit);
  const left = scored.slice(limit);
  const result: RecallResult = {
    query,
    limit,
    rows: kept.map((item, index) => ({
      chunk: item.chunk,
      recallRank: index + 1,
      coarseScore: item.coarseScore,
      hits: item.hits,
    })),
    leftOut: left.map((item) => ({
      id: item.chunk.id,
      title: item.chunk.title,
      coarseScore: item.coarseScore,
    })),
  };

  logger.info(
    "调用函数-recallCandidates",
    "调用函数结束：recallCandidates",
    "为什么写这条日志：桌上名单已经定了，下一步才能精排。当前：已截前 N 条，没上桌的切块精排看不见。",
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );
  return result;
}
