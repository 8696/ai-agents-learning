/**
 * 职责：在已建好的向量索引（vector-index）上跑余弦相似度（Cosine Similarity）排序。
 * 数据流：queryVec（外部算好的问句向量）→ indexed 数组里 6 条子块向量 → 余弦相似度
 *       → 按分数降序排 → topK 内标 isHit=true。
 *
 * 为什么单独成文件：检索打分这一步独立于「建库」「按 parentId 取父块」「调对话补全」，
 * 改打分算法（如换成 BM25 / 混合）只动这一处。
 *
 * 之前这一文件自己做嵌入 + 余弦；现在拆成「建库（vector-index） + 检索（这里）」两步。
 * 检索这一步只算 queryVec 这一个向量（在 parent-child-retrieve 里），不再重算所有子块。
 *
 * 余弦相似度详模块 08 03：cos(A, B) = (A · B) / (|A| × |B|)，只看方向不看长度。
 */
import type { ChildChunk } from "./handbook.js";
import { getIndexed, type IndexedChild } from "./vector-index.js";
import { logger } from "../logger.js";

export type ScoredChild = ChildChunk & {
  /** 余弦相似度（Cosine Similarity），取值范围 [-1, 1]；本库正例基本在 [0, 1] */
  score: number;
  /** 排名（按分数降序，1 = 第一名；平手按 id 字典序） */
  rank: number;
  /** 是否入选 topK：前 K 条 = true；其余 = false */
  isHit: boolean;
};

/** cos(A, B) = (A · B) / (|A| × |B|)。模为 0 时返回 0（避免除零）。 */
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 在已建好的索引上跑余弦相似度，返回按分数降序排的全 6 条（带 isHit）。 */
export function scoreIndexed(queryVec: number[], topK: number): ScoredChild[] {
  const started = Date.now();
  const indexed: IndexedChild[] = getIndexed();

  logger.info(
    "│ scoreIndexed",
    "调用函数开始：scoreIndexed",
    "为什么：在已建好的向量索引上跑余弦相似度排序；这一步不算嵌入（已经算过了），只比较方向。当前：准备排序。",
    {
      __code: scoreIndexed.toString(),
      入参: { queryVecDim: queryVec.length, topK, indexedCount: indexed.length },
    },
  );

  const scored: ScoredChild[] = indexed.map((item) => ({
    id: item.id,
    parentId: item.parentId,
    title: item.title,
    text: item.text,
    score: cosine(queryVec, item.vector),
    rank: 0,
    isHit: false,
  }));
  // 按余弦相似度从高到低排，平手按 id 字典序（保证排名稳定）
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const ranked = scored.map((item, index) => ({ ...item, rank: index + 1 }));
  // topK 内的标 isHit=true；其余 isHit=false（前端 ChildCoverage 卡可看完整覆盖）
  const hitIds = new Set(ranked.slice(0, topK).map((item) => item.id));
  const result = ranked.map((item) => ({ ...item, isHit: hitIds.has(item.id) }));

  logger.info(
    "│ scoreIndexed",
    "调用函数结束：scoreIndexed",
    "为什么：所有 6 个子块都打了余弦相似度，前端能看见完整覆盖；topK 内的标 isHit=true。当前：排序 + 标 isHit 完成。",
    {
      返回值: result,
      耗时ms: Date.now() - started,
    },
  );

  return result;
}