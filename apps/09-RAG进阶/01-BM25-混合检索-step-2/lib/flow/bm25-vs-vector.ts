/**
 * 本步核心：同一库、同一问句、向量检索（Dense Retrieval）与 BM25 关键词检索（Sparse Retrieval）
 *           分请求对照——证明「向量不擅长什么、BM25 补什么」。
 *
 * 职责：
 *   - searchByVector：用嵌入模型算 query 向量，与语料各卡的向量算余弦相似度（Cosine Similarity），
 *                    按分数降序排 rank，截 Top-K。
 *   - searchByBm25  ：按词打 BM25，按分数降序排 rank，截 Top-K。
 *
 * 两者都基于同一份内置 CORPUS，但走两条互不相干的路径：
 *   向量侧必须先调嵌入模型（真发网络请求）；BM25 侧纯本地。
 *   前端每次点「向量侧 / BM25 侧」按钮，发两条独立 HTTP 请求（一个 /api/search-vector、
 *   一个 /api/search-bm25），拿到两份 Top-K 并排展示。
 *
 * 数据流（向量侧）：
 *   输入 { query, topK } → ensureCorpusVectors（启动时懒加载）→
 *   embedTexts([query], "query") → 余弦相似度 → 排序 → 截 Top-K → 返回 rows
 *
 * 数据流（BM25 侧）：
 *   输入 { query, topK } → bm25Score(query, CORPUS) → 截 Top-K → 返回 rows
 *
 * 主流程单独成文件的原因（§5.3.8）：
 *   教学者复习时打开这一个文件就能把两条对照路径读完。
 *   routes 只校验入参 + 调用本文件 + 写 ctx.body。
 */
import { getLlm } from "../../../../llm.js";
import type { Llm } from "../../../../llm.js";
import { HttpError } from "../http/send-error.js";
import { withCall } from "../http/with-call.js";
import { embedTexts } from "../embed/create-embeddings.js";
import { CORPUS, type KnowledgeCard } from "../corpus/knowledge-base.js";
import { bm25Score } from "../corpus/bm25.js";

/** 语料向量缓存：第一次请求时算一次，存到模块顶层，后续请求复用。 */
type CorpusVectorRow = { id: string; text: string; vector: number[] };
let corpusVectorsCache: CorpusVectorRow[] | null = null;

async function ensureCorpusVectors(llm: Llm): Promise<CorpusVectorRow[]> {
  if (corpusVectorsCache) return corpusVectorsCache;
  const texts = CORPUS.map((c) => c.text);
  // CORPUS 是「库」性质——按 type=db 走；与提问侧 type=query 区分（同模型两边约定一致）
  const vectors = await embedTexts(llm, texts, "db");
  corpusVectorsCache = CORPUS.map((card, idx) => ({
    id: card.id,
    text: card.text,
    vector: vectors[idx]!,
  }));
  return corpusVectorsCache;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i]! * b[i]!;
  return s;
}

function vectorLength(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

/** 余弦相似度（Cosine Similarity）—— 与模块 08 第 3 条同一公式 */
function cosineSimilarity(a: number[], b: number[]): number {
  const denom = vectorLength(a) * vectorLength(b);
  if (denom === 0) {
    throw new HttpError(500, "零向量算不了余弦相似度", "查一下嵌入接口是否返回全 0");
  }
  return dot(a, b) / denom;
}

export type SearchRow = {
  cardId: string;
  text: string;
  score: number;
  rank: number;
  matchedTerms: string[];
};

export type VectorSearchResult = {
  query: string;
  topK: number;
  embeddingModel: string;
  rows: SearchRow[];
};

export type Bm25SearchResult = {
  query: string;
  topK: number;
  tokens: string[];
  rows: SearchRow[];
};

const DEFAULT_TOPK = 3;

export async function searchByVector(input: { query: string; topK?: number }): Promise<VectorSearchResult> {
  const query = input.query.trim();
  const topK = input.topK ?? DEFAULT_TOPK;
  if (!query) {
    throw new HttpError(400, "query 是空的", "输入框写一句再点向量侧按钮");
  }

  return await withCall({
    scope: "│ 调用函数-searchByVector",
    kind: "函数",
    name: "searchByVector",
    explain:
      "为什么写这条日志：本步核心 = 向量检索。里面那次才是真发网络请求的嵌入调用（看「调用模型开始」）。当前：路由已校验 query，准备拿语料向量 + 算 query 向量。",
    args: { query, topK },
    code: "searchByVector({ query, topK })",
    run: async () => {
      const llm = getLlm();
      const corpusVecs = await ensureCorpusVectors(llm);
      const queryVecRows = await embedTexts(llm, [query], "query");
      const queryVec = queryVecRows[0]!;
      const rows = corpusVecs.map<SearchRow>((row) => ({
        cardId: row.id,
        text: row.text,
        score: cosineSimilarity(queryVec, row.vector),
        rank: 0,
        matchedTerms: [],
      }));
      rows.sort((a, b) => b.score - a.score);
      rows.forEach((row, idx) => {
        row.rank = idx + 1;
      });
      return {
        query,
        topK,
        embeddingModel: llm.embeddingModel,
        rows: rows.slice(0, topK),
      };
    },
  });
}

export async function searchByBm25(input: { query: string; topK?: number }): Promise<Bm25SearchResult> {
  const query = input.query.trim();
  const topK = input.topK ?? DEFAULT_TOPK;
  if (!query) {
    throw new HttpError(400, "query 是空的", "输入框写一句再点 BM25 侧按钮");
  }

  return await withCall({
    scope: " 调用函数-searchByBm25",
    kind: "函数",
    name: "searchByBm25",
    explain:
      "为什么写这条日志：本步核心 = BM25 关键词检索。纯本地，不调网络。当前：路由已校验 query，准备 tokenize + 打分。",
    args: { query, topK },
    code: "searchByBm25({ query, topK })",
    run: async () => {
      const scored = bm25Score(query, CORPUS as KnowledgeCard[]);
      return {
        query,
        topK,
        tokens: scored.tokens,
        rows: scored.rows.slice(0, topK).map<SearchRow>((row) => ({
          cardId: row.card.id,
          text: row.card.text,
          score: row.score,
          rank: row.rank,
          matchedTerms: row.matchedTerms,
        })),
      };
    },
  });
}

/** 重置缓存（烟雾测试 / 热重载时用；业务路径不调） */
export function _resetCorpusVectorsCache(): void {
  corpusVectorsCache = null;
}

/**
 * 把当前语料向量缓存「暴露」给前端——只回前 8 维 + L2 范数（norm），不全量回（动辄上千维）。
 * 第一次请求前缓存可能还没建：返回 cached=false；前端按 [未嵌入] 标记。
 */
export function previewCorpusVectors(): {
  cached: boolean;
  embeddingModel: string | null;
  cards: Array<{ id: string; text: string; vectorPreview: number[]; norm: number }>;
} {
  if (!corpusVectorsCache) {
    return {
      cached: false,
      embeddingModel: null,
      cards: CORPUS.map((card) => ({ id: card.id, text: card.text, vectorPreview: [], norm: 0 })),
    };
  }
  return {
    cached: true,
    embeddingModel: getLlm().embeddingModel,
    cards: corpusVectorsCache.map((row) => {
      const preview = row.vector.slice(0, 8);
      const norm = Math.sqrt(row.vector.reduce((s, x) => s + x * x, 0));
      return { id: row.id, text: row.text, vectorPreview: preview, norm };
    }),
  };
}