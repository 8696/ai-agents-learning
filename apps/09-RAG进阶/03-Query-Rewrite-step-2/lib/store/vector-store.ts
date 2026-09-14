/**
 * 职责：本步的向量存储 —— 8 个切块嵌入一次，余弦相似度按 top-K 排序。
 * 数据流：startup 时把所有 CHUNKS 嵌入一次 → Map<id, vector>；每次检索：embed query → →
 *         cosine vs 全部 chunk vector → sort by score desc → slice topK。
 * 本步核心：8 个切块太少，运行时内存嵌入就够，不引 SQLite / LanceDB。
 *          余弦按 [模块 08 01-RAG-流水线-step-4 lib/store/vector-store.ts:26-38] 同款算法。
 */
import { CHUNKS, type Chunk, TARGET_ID } from "../corpus/chunks.js";
import { embedTexts, HttpError } from "../embed/create-embeddings.js";
import { logger } from "../logger.js";
import { getLlm } from "../../../../llm.js";

/** 已嵌入切块的向量缓存：id → vector。启动时一次性建好。 */
let prebuilt: Map<string, number[]> | null = null;

export type VectorHit = {
  id: string;
  title: string;
  text: string;
  /** 余弦相似度，[-1, 1]，越大越像 */
  score: number;
  rank: number;
  onTable: boolean;
  isTarget: boolean;
};

export type VectorRetrieveResult = {
  queryUsed: string;
  ranked: VectorHit[];
  target: { id: string; onTable: boolean; rank: number | null; score: number };
  dim: number;
};

/**
 * 余弦相似度：dot(a, b) / (||a|| × ||b||)。
 * 一长两段循环，避免 new Array / map 开销。
 */
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * 启动时一次性嵌入所有切块，缓存到 Map<id, vector>。
 * 无 LLM / 无 embeddingModel → 抛错，503 给到 /health。
 */
export async function preEmbedChunks(): Promise<Map<string, number[]>> {
  if (prebuilt) return prebuilt;

  const t0 = Date.now();
  logger.info(
    "调用函数-preEmbedChunks",
    "调用函数开始：preEmbedChunks",
    "为什么写这条日志：8 个切块先嵌入一次缓存起来，检索时只对 query 嵌入 —— 不重复花钱。当前：即将调嵌入接口，type=db。",
    { 入参: { chunksCount: CHUNKS.length } },
  );

  const llm = getLlm();
  const texts = CHUNKS.map((c) => c.title + " " + c.text);
  const vectors = await embedTexts(llm, texts, "db");

  prebuilt = new Map();
  for (let i = 0; i < CHUNKS.length; i += 1) {
    prebuilt.set(CHUNKS[i].id, vectors[i]);
  }

  logger.info(
    "调用函数-preEmbedChunks",
    "调用函数结束：preEmbedChunks",
    "为什么写这条日志：缓存命中 = 后续检索不必再嵌入 CHUNKS。当前：嵌入完成。",
    {
      返回值: { dim: vectors[0]?.length ?? 0, ids: [...prebuilt.keys()] },
      耗时ms: Date.now() - t0,
      __code:
        "const vectors = await embedTexts(llm, CHUNKS.map(c => c.title + ' ' + c.text), 'db');\n" +
        "prebuilt = new Map();\n" +
        "for (let i = 0; i < CHUNKS.length; i += 1) prebuilt.set(CHUNKS[i].id, vectors[i]);",
    },
  );
  return prebuilt;
}

/** 运行时按 query 向量做 top-K 余弦检索。 */
export function cosineSearch(queryVector: number[], queryUsed: string, topK: number): VectorRetrieveResult {
  const t0 = Date.now();
  logger.info(
    "调用函数-cosineSearch",
    "调用函数开始：cosineSearch",
    "为什么写这条日志：嵌入完 query 就要排序。当前：按余弦相似度对预嵌入的 8 个切块打分。",
    { 入参: { topK, queryVectorLen: queryVector.length } },
  );

  if (!prebuilt) {
    throw new HttpError(503, "切块预嵌入未完成。请先跑一次预嵌入（或重启服务）。");
  }

  const scored: Array<{ chunk: Chunk; score: number }> = [];
  for (const chunk of CHUNKS) {
    const vec = prebuilt.get(chunk.id);
    if (!vec) continue;
    const score = cosine(queryVector, vec);
    scored.push({ chunk, score });
  }
  scored.sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));

  let rank = 1;
  const ranked: VectorHit[] = scored.map((row) => {
    const hit: VectorHit = {
      id: row.chunk.id,
      title: row.chunk.title,
      text: row.chunk.text,
      score: row.score,
      rank,
      onTable: true,
      isTarget: row.chunk.isTarget,
    };
    rank += 1;
    return hit;
  });

  const targetRow = ranked.find((r) => r.id === TARGET_ID);
  const result: VectorRetrieveResult = {
    queryUsed,
    ranked: ranked.slice(0, topK),
    target: {
      id: TARGET_ID,
      onTable: Boolean(targetRow),
      rank: targetRow ? targetRow.rank : null,
      score: targetRow ? targetRow.score : 0,
    },
    dim: queryVector.length,
  };

  logger.info(
    "调用函数-cosineSearch",
    "调用函数结束：cosineSearch",
    "为什么写这条日志：页面要看见 top-K + 目标切块 cosine。当前：余弦排序完成。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      __code:
        "const scored = CHUNKS.map(chunk => ({ chunk, score: cosine(queryVector, prebuilt.get(chunk.id)) }));\n" +
        "scored.sort((a, b) => b.score - a.score);\n" +
        "const ranked = scored.slice(0, topK).map(...);",
      字段释义: {
        "ranked[].score": "余弦相似度，[-1, 1]，越大越像",
        "target.onTable": "目标切块是否进 top-K；onTable=true 才算命中学要的",
      },
    },
  );
  return result;
}