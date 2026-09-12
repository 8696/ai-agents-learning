/**
 * 本步核心：RRF（Reciprocal Rank Fusion，倒数排名融合，变体 6）。
 *           「不看分数只看名次」——绕过加权融合需要拉齐的坑。
 *
 * 职责：并行调两侧（searchByVector + searchByBm25）→ 各出 Top-N →
 *       按名次投票 `score = Σ 1/(k + rank)`，两边相加 →
 *       排序 → Top-K。
 *
 * 数据流：输入 { query, k, topK, n } → Promise.all 两侧 → 名次投票 → 排序 → Top-K → 返回 rows
 *
 * 为什么单独成文件：
 *   本步教学点是「不拉齐、不看分数」——和 step-2 的加权融合 + min-max 拉齐是两种融合思路。
 *   学习者打开这一个文件就能把「RRF 怎么算」读完。
 */
import { z } from "zod";
import { withCall } from "../http/with-call.js";
import { searchByVector, searchByBm25, type SearchRow } from "./bm25-vs-vector.js";

export type RrfRow = {
  cardId: string;
  text: string;
  /** RRF 总分 = Σ 1/(k + rank)，越大越相关 */
  rrfScore: number;
  /** 1-based rank（按 rrfScore 降序） */
  rank: number;
  /** 在向量侧的排名（1-based；没出现在该侧 = 0） */
  vectorRank: number;
  /** 在 BM25 侧的排名（1-based；没出现在该侧 = 0） */
  bm25Rank: number;
  /** 向量侧贡献 = 1/(k + vectorRank) */
  vectorContribution: number;
  /** BM25 侧贡献 = 1/(k + bm25Rank) */
  bm25Contribution: number;
  /** 这张卡出现在哪一侧 */
  source: "vector" | "bm25" | "both";
};

export type RrfSearchResult = {
  query: string;
  topK: number;
  k: number;
  vectorTopN: SearchRow[];
  bm25TopN: SearchRow[];
  rows: RrfRow[];
};

export type RrfInput = {
  query: string;
  k?: number;
  topK?: number;
  n?: number;
};

const DEFAULT_TOPK = 3;
const DEFAULT_N = 20;
const DEFAULT_K = 60; // 经典 RRF k 值

const inputSchema = z.object({
  query: z.string().min(1, "query 不能为空"),
  k: z.number().int().positive().optional().default(DEFAULT_K),
  topK: z.number().int().positive().optional().default(DEFAULT_TOPK),
  n: z.number().int().positive().optional().default(DEFAULT_N),
});

/** 计算单张卡的 RRF 总分。vectorRank/bm25Rank = 0 表示该侧没出现 → 该侧贡献 0。 */
function rrfContribution(rank: number, k: number): number {
  if (rank === 0) return 0;
  return 1 / (k + rank);
}

export async function searchRrf(input: RrfInput): Promise<RrfSearchResult> {
  const parsed = inputSchema.parse({
    query: input.query,
    k: input.k ?? DEFAULT_K,
    topK: input.topK ?? DEFAULT_TOPK,
    n: input.n ?? DEFAULT_N,
  });
  const { query, k, topK, n } = parsed;

  return await withCall({
    scope: "│ 调用函数-searchRrf",
    kind: "函数",
    name: "searchRrf",
    explain:
      "为什么写这条日志：本步核心 = RRF 倒数排名融合。里面两侧调用是并行（vector 嵌入 + BM25 本地）。当前：入参已校验，准备并行两侧 → 按名次投票 → 排序。",
    args: { query, k, topK, n },
    code: "searchRrf({ query, k, topK, n })",
    run: async () => {
      // ① 并行两侧，各出 Top-N
      const [vecOut, bm25Out] = await Promise.all([
        searchByVector({ query, topK: n }),
        searchByBm25({ query, topK: n }),
      ]);
      const vectorTopN = vecOut.rows;
      const bm25TopN = bm25Out.rows;

      // ② 按名次投票：每张卡累计两侧 1/(k+rank)
      const merged = new Map<string, { vectorRank: number; bm25Rank: number }>();
      for (const row of vectorTopN) {
        merged.set(row.cardId, { vectorRank: row.rank, bm25Rank: 0 });
      }
      for (const row of bm25TopN) {
        const prev = merged.get(row.cardId);
        if (prev) prev.bm25Rank = row.rank;
        else merged.set(row.cardId, { vectorRank: 0, bm25Rank: row.rank });
      }

      // ③ 算 RRF 总分 + 来源徽标
      const cardIds = [...merged.keys()];
      const rows = cardIds.map<RrfRow>((id) => {
        const { vectorRank, bm25Rank } = merged.get(id)!;
        const vContrib = rrfContribution(vectorRank, k);
        const bContrib = rrfContribution(bm25Rank, k);
        let source: "vector" | "bm25" | "both";
        if (vectorRank > 0 && bm25Rank > 0) source = "both";
        else if (vectorRank > 0) source = "vector";
        else source = "bm25";
        return {
          cardId: id,
          text: vectorTopN.find((r) => r.cardId === id)?.text
            ?? bm25TopN.find((r) => r.cardId === id)?.text
            ?? "",
          rrfScore: vContrib + bContrib,
          rank: 0,
          vectorRank,
          bm25Rank,
          vectorContribution: vContrib,
          bm25Contribution: bContrib,
          source,
        };
      });

      // ④ 按 RRF 总分排序 → 赋 rank → 截 Top-K
      rows.sort((a, b) => b.rrfScore - a.rrfScore);
      rows.forEach((row, idx) => {
        row.rank = idx + 1;
      });

      return {
        query,
        topK,
        k,
        vectorTopN,
        bm25TopN,
        rows: rows.slice(0, topK),
      };
    },
  });
}