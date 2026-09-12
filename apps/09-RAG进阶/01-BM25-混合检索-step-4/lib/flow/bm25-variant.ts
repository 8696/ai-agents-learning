/**
 * 本步核心：切词对照（变体 8）——同一问句用两种切词法 → 同一 BM25 → 排名变差。
 *           「保留连字符」vs「撕成单字」是中文 BM25 最容易踩的两个极端。
 *
 * 职责：调 bm25Score 两次（mode 不同）→ 同一份 CORPUS → 不同的 tokens + 不同的 Top-K。
 *
 * 数据流：输入 { query, topK } → bm25Score(query, CORPUS, "keep-dash") + bm25Score(query, CORPUS, "split-chars") → 返回两份结果
 *
 * 为什么单独成文件：
 *   本步教学点是「切词变了 = 排名变」——和 step-1 的「BM25 算分」层是同一个函数
 *   （bm25Score），但调用层要承担「两种切法对照」这个对照实验。
 */
import { withCall } from "../http/with-call.js";
import { bm25Score, type Bm25Row, type TokenizeMode } from "../corpus/bm25.js";
import { CORPUS, type KnowledgeCard } from "../corpus/knowledge-base.js";

export type Bm25VariantResult = {
  query: string;
  topK: number;
  mode: TokenizeMode;
  tokens: string[];
  rows: Array<{
    cardId: string;
    text: string;
    score: number;
    rank: number;
    matchedTerms: string[];
  }>;
};

export type Bm25VariantSearchResult = {
  query: string;
  topK: number;
  keepDash: Bm25VariantResult;
  splitChars: Bm25VariantResult;
};

export async function bm25Variant(input: { query: string; topK?: number }): Promise<Bm25VariantSearchResult> {
  const query = input.query.trim();
  const topK = input.topK ?? 3;
  if (!query) {
    throw new Error("query 不能为空");
  }

  return await withCall({
    scope: "│ 调用函数-bm25Variant",
    kind: "函数",
    name: "bm25Variant",
    explain:
      "为什么写这条日志：本步核心 = 切词对照。里面两次 bm25Score 是同一函数、不同 mode（keep-dash vs split-chars）。当前：入参已校验，准备调两次。",
    args: { query, topK },
    code: "bm25Variant({ query, topK })",
    run: async () => {
      const keepDashScored = bm25Score(query, CORPUS as KnowledgeCard[], { mode: "keep-dash" });
      const splitCharsScored = bm25Score(query, CORPUS as KnowledgeCard[], { mode: "split-chars" });

      function toResult(scored: { tokens: string[]; mode: TokenizeMode; rows: Bm25Row[] }): Bm25VariantResult {
        return {
          query,
          topK,
          mode: scored.mode,
          tokens: scored.tokens,
          rows: scored.rows.slice(0, topK).map((row) => ({
            cardId: row.card.id,
            text: row.card.text,
            score: row.score,
            rank: row.rank,
            matchedTerms: row.matchedTerms,
          })),
        };
      }

      return {
        query,
        topK,
        keepDash: toResult(keepDashScored),
        splitChars: toResult(splitCharsScored),
      };
    },
  });
}