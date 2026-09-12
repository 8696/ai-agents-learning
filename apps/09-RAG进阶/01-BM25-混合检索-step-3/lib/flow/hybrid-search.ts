/**
 * 本步核心：混合两边召回（变体 4）+ 加权融合 + min-max 拉齐（变体 5）。
 *           「未拉齐 vs 拉齐后」对照 = 本步最该记住的易混点。
 *
 * 职责：并行调两侧（searchByVector + searchByBm25）→ 各出 Top-N →
 *       可选：min-max 归一化 → 加权融合 α × norm(vec) + (1-α) × norm(bm25) →
 *       按融合分排序 → Top-K。
 *
 * 数据流：输入 { query, alpha, topK, normalize, n } → Promise.all 两侧 →
 *         min-max（normalize=true 时） → 合并（按 cardId）→ 加权 → 排序 → Top-K → 返回 rows
 *
 * 为什么单独成文件：
 *   本步核心是「加权融合 + 拉齐」——这是和 step-1 完全不同的算法层。
 *   step-1 的 searchByVector / searchByBm25 是「打分」层，本文件是「合成」层。
 */
import { z } from "zod";
import { withCall } from "../http/with-call.js";
import { searchByVector, searchByBm25, type SearchRow } from "./bm25-vs-vector.js";
import type { KnowledgeCard } from "../corpus/knowledge-base.js";
import { CORPUS } from "../corpus/knowledge-base.js";

export type HybridSource = "vector" | "bm25" | "both";

export type HybridRow = {
  cardId: string;
  text: string;
  /** 加权融合后的最终分（越大越相关） */
  score: number;
  /** 1-based rank（按 score 降序） */
  rank: number;
  /** 原始向量分（cosine ∈ [0, 1]） */
  vectorScore: number;
  /** 原始 BM25 分（教学版可能 0~几十） */
  bm25Score: number;
  /** min-max 归一化后的向量分 ∈ [0, 1]；normalize=false 时 = vectorScore */
  vectorNorm: number;
  /** min-max 归一化后的 BM25 分 ∈ [0, 1]；normalize=false 时 = bm25Score */
  bm25Norm: number;
  /** 这张卡出现在哪一侧的名单里 */
  source: HybridSource;
};

export type HybridSearchResult = {
  query: string;
  topK: number;
  alpha: number;
  normalize: boolean;
  /** 两侧召回的 Top-N（用于对照展示） */
  vectorTopN: SearchRow[];
  bm25TopN: SearchRow[];
  rows: HybridRow[];
};

export type HybridInput = {
  query: string;
  alpha?: number;
  topK?: number;
  normalize?: boolean;
  n?: number;
};

const DEFAULT_TOPK = 3;
const DEFAULT_N = 20;
const DEFAULT_ALPHA = 0.5;

const inputSchema = z.object({
  query: z.string().min(1, "query 不能为空"),
  alpha: z.number().min(0).max(1).optional().default(DEFAULT_ALPHA),
  topK: z.number().int().positive().optional().default(DEFAULT_TOPK),
  normalize: z.boolean().optional().default(true),
  n: z.number().int().positive().optional().default(DEFAULT_N),
});

/** min-max 归一化：把一组分数拉到 [0, 1]。max=min 时全 0（防除以 0） */
function minMaxNormalize(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  if (max === min) return scores.map(() => 0);
  return scores.map((s) => (s - min) / (max - min));
}

/** 卡片 id → 文本（用于返回行的 text） */
function cardTextById(id: string): string {
  return (CORPUS as KnowledgeCard[]).find((c) => c.id === id)?.text ?? "";
}

export async function searchHybrid(input: HybridInput): Promise<HybridSearchResult> {
  const parsed = inputSchema.parse({
    query: input.query,
    alpha: input.alpha ?? DEFAULT_ALPHA,
    topK: input.topK ?? DEFAULT_TOPK,
    normalize: input.normalize ?? true,
    n: input.n ?? DEFAULT_N,
  });
  const { query, alpha, topK, normalize, n } = parsed;

  return await withCall({
    scope: "│ 调用函数-searchHybrid",
    kind: "函数",
    name: "searchHybrid",
    explain:
      "为什么写这条日志：本步核心 = 混合两边召回 + 加权融合。里面两侧调用是真发网络请求的并行（vector 嵌入 + BM25 本地）。当前：入参已校验，准备并行两侧。",
    args: { query, alpha, topK, normalize, n },
    code: "searchHybrid({ query, alpha, topK, normalize, n })",
    run: async () => {
      // ① 并行两侧，各出 Top-N（不是 Top-K；Top-K 由融合决定）
      const [vecOut, bm25Out] = await Promise.all([
        searchByVector({ query, topK: n }),
        searchByBm25({ query, topK: n }),
      ]);
      const vectorTopN = vecOut.rows;
      const bm25TopN = bm25Out.rows;

      // ② 合并：按 cardId 去重；记录来源侧
      const merged = new Map<string, { vector: number; bm25: number }>();
      for (const row of vectorTopN) {
        merged.set(row.cardId, { vector: row.score, bm25: 0 });
      }
      for (const row of bm25TopN) {
        const prev = merged.get(row.cardId);
        if (prev) prev.bm25 = row.score;
        else merged.set(row.cardId, { vector: 0, bm25: row.score });
      }

      const cardIds = [...merged.keys()];
      const vecScores = cardIds.map((id) => merged.get(id)!.vector);
      const bm25Scores = cardIds.map((id) => merged.get(id)!.bm25);

      // ③ min-max 归一化（可选）
      const vecNorm = normalize ? minMaxNormalize(vecScores) : vecScores;
      const bm25Norm = normalize ? minMaxNormalize(bm25Scores) : bm25Scores;

      // ④ 加权 + 来源徽标
      const rows = cardIds.map<HybridRow>((id, i) => {
        const v = vecScores[i]!;
        const b = bm25Scores[i]!;
        const vn = vecNorm[i]!;
        const bn = bm25Norm[i]!;
        let source: HybridSource;
        if (v > 0 && b > 0) source = "both";
        else if (v > 0) source = "vector";
        else source = "bm25";
        return {
          cardId: id,
          text: cardTextById(id),
          score: alpha * vn + (1 - alpha) * bn,
          rank: 0,
          vectorScore: v,
          bm25Score: b,
          vectorNorm: vn,
          bm25Norm: bn,
          source,
        };
      });

      // ⑤ 按融合分排序 → 赋 rank → 截 Top-K
      rows.sort((a, b) => b.score - a.score);
      rows.forEach((row, idx) => {
        row.rank = idx + 1;
      });

      return {
        query,
        topK,
        alpha,
        normalize,
        vectorTopN,
        bm25TopN,
        rows: rows.slice(0, topK),
      };
    },
  });
}