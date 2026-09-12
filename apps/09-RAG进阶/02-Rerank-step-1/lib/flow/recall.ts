/**
 * 粗召回（Recall）—— 复用上一节混合检索的能力：向量 + BM25 → RRF 倒数排名融合。
 *
 * 数据流：{ query, n } → 并行调 searchByVector + searchByBm25（各 Top-N）→
 *       按名次投票 RRF → 合并 → 截 Top-K。
 *
 * 本 demo 的"主流程单独成文件"规则在 lib/flow/rerank.ts —— recall 是它的一个子步骤。
 * 本文件只管粗召回，单一职责，方便对照阅读。
 */
import { withCall } from "../http/with-call.js";
import { getLlm } from "../../../../llm.js";
import type { Llm } from "../../../../llm.js";
import { HttpError } from "../http/send-error.js";
import { embedTexts } from "../embed/create-embeddings.js";
import { CORPUS, type KnowledgeCard } from "../corpus/knowledge-base.js";
import { bm25Score } from "../corpus/bm25.js";

export type SearchRow = {
  cardId: string;
  text: string;
  /** 余弦相似度（向量侧）/ BM25 原始分（BM25 侧） */
  score: number;
  rank: number;
  matchedTerms: string[];
};

/** 语料向量缓存：第一次请求时算一次，存到模块顶层，后续请求复用 */
type CorpusVectorRow = { id: string; text: string; vector: number[] };
let corpusVectorsCache: CorpusVectorRow[] | null = null;

async function ensureCorpusVectors(llm: Llm): Promise<CorpusVectorRow[]> {
  if (corpusVectorsCache) return corpusVectorsCache;
  const texts = CORPUS.map((c) => c.text);
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

function cosineSimilarity(a: number[], b: number[]): number {
  const denom = vectorLength(a) * vectorLength(b);
  if (denom === 0) {
    throw new HttpError(500, "零向量算不了余弦相似度", "查一下嵌入接口是否返回全 0");
  }
  return dot(a, b) / denom;
}

export async function searchByVector(query: string, topK: number): Promise<{
  rows: SearchRow[];
  embeddingModel: string;
}> {
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
  return { rows: rows.slice(0, topK), embeddingModel: llm.embeddingModel };
}

export async function searchByBm25(query: string, topK: number): Promise<{
  rows: SearchRow[];
  tokens: string[];
}> {
  const scored = bm25Score(query, CORPUS as KnowledgeCard[]);
  return {
    rows: scored.rows.slice(0, topK).map<SearchRow>((row) => ({
      cardId: row.card.id,
      text: row.card.text,
      score: row.score,
      rank: row.rank,
      matchedTerms: row.matchedTerms,
    })),
    tokens: scored.tokens,
  };
}

/** RRF 倒数排名融合 —— 经典 k=60；按名次投票 `1/(k+rank)`，绕过加权融合需要拉齐的坑 */
const DEFAULT_K = 60;

export type RrfRow = {
  cardId: string;
  text: string;
  rrfScore: number;
  vectorRank: number;
  bm25Rank: number;
  vectorContribution: number;
  bm25Contribution: number;
  source: "vector" | "bm25" | "both";
};

export type RecallResult = {
  query: string;
  n: number;
  k: number;
  vectorTopN: SearchRow[];
  bm25TopN: SearchRow[];
  /** 融合后的完整榜（含来源信息）；路由层负责截 Top-K 喂给精排 */
  rows: RrfRow[];
};

export async function recallOnce(query: string, n: number): Promise<RecallResult> {
  return await withCall({
    scope: " 调用函数-recallOnce",
    kind: "函数",
    name: "recallOnce（粗召回）",
    explain:
      "为什么写这条日志：本步第一阶段 = 粗召回。里面并行调向量嵌入 + BM25 本地，按名次 RRF 融合。当前：路由已校验入参，准备两侧并行。",
    args: { query, n },
    code: "recallOnce({ query, n })",
    run: async () => {
      // ① 并行两侧，各出 Top-N
      const [vecOut, bm25Out] = await Promise.all([
        searchByVector(query, n),
        searchByBm25(query, n),
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
        const vContrib = vectorRank > 0 ? 1 / (DEFAULT_K + vectorRank) : 0;
        const bContrib = bm25Rank > 0 ? 1 / (DEFAULT_K + bm25Rank) : 0;
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
          vectorRank,
          bm25Rank,
          vectorContribution: vContrib,
          bm25Contribution: bContrib,
          source,
        };
      });
      rows.sort((a, b) => b.rrfScore - a.rrfScore);

      return {
        query,
        n,
        k: DEFAULT_K,
        vectorTopN,
        bm25TopN,
        rows,
      };
    },
  });
}

/**
 * 把当前语料向量缓存「暴露」给前端 —— 只回前 8 维 + L2 范数（norm），不全量回（动辄上千维）。
 * 第一次请求前缓存可能还没建：返回 cached=false；前端按 [未嵌入] 标记。
 *
 * 不调网络：只读缓存。缓存建起来需要调一次 searchByVector（即第一次跑粗召回时建）。
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