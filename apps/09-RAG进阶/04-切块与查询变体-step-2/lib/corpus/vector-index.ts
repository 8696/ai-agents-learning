/**
 * 职责：内存向量索引（Vector Index）——本步的「向量库」。
 * 数据流：buildIndex(llm) 把 6 个子块正文都变成向量，存进模块级 Map<childId, vector>；
 *        searchIndexed(queryVec, topK) 在这个索引上跑余弦相似度返回 topK 条。
 *
 * 为什么单独成文件：把「建库（一次性）」和「检索（每次提问）」明确拆开——
 * 建库只跑一次，检索每次提问跑一次。生产上向量库是真数据库（Chroma / Pinecone / Milvus）；
 * 这里用内存 Map 演示同形状。
 *
 * 生产对照：
 *   · 入库时把每个切块变向量存进向量库——这就是 buildIndex 干的事。
 *   · 检索时只算问句向量，再去向量库搜——这就是 searchIndexed 干的事。
 *   · 父块（PARENTS）不进向量库——父子切块的根就是只让子块进库。
 */
import { CHILDREN, type ChildChunk } from "./handbook.js";
import { getLlmOptional, type Llm } from "../../../../llm.js";
import { logger } from "../logger.js";
import { fetchEmbeddings, vectorDim } from "./embed-client.js";

export type IndexedChild = ChildChunk & { vector: number[] };

export type IndexStatus = {
  built: boolean;
  childCount: number;
  builtAt: string;
  buildDurationMs: number;
  vectorsDim: number;
  provider: string;
  embeddingModel: string;
};

let indexBuilt = false;
let builtAt = "";
let buildDurationMs = 0;
let indexed: IndexedChild[] = [];

export function getIndexed(): IndexedChild[] {
  return indexed;
}

export function isIndexBuilt(): boolean {
  return indexBuilt;
}

export function getIndexStatus(): IndexStatus {
  const llm = getLlmOptional();
  return {
    built: indexBuilt,
    childCount: indexed.length,
    builtAt,
    buildDurationMs,
    vectorsDim: indexed[0]?.vector.length ?? 0,
    provider: llm?.provider ?? "",
    embeddingModel: llm?.embeddingModel ?? "",
  };
}

/**
 * 建库：把 CHILDREN 全部变成向量，存到模块级数组。
 * 重复调用会覆盖旧索引（重建）。
 */
export async function buildIndex(llm: Llm): Promise<IndexStatus> {
  const started = Date.now();

  if (!llm.embeddingModel) {
    throw new Error(
      `当前提供商 ${llm.provider} 没有默认嵌入模型；请在 apps/.env 设 LLM_EMBEDDING_MODEL，或换 LLM_PROVIDER（DeepSeek 官方目前没有嵌入接口）。`,
    );
  }

  logger.info(
    "buildIndex",
    "调用函数开始：buildIndex",
    "为什么：把 6 个子块正文都变成向量，存到内存向量库；检索时只算问句向量再去查。当前：准备调嵌入接口。",
    {
      __code: buildIndex.toString(),
      入参: { provider: llm.provider, embeddingModel: llm.embeddingModel, childCount: CHILDREN.length },
    },
  );

  const childTexts = CHILDREN.map((c) => `${c.title} ${c.text}`);
  const vectors = await fetchEmbeddings(llm, childTexts);

  if (vectors.length !== CHILDREN.length) {
    throw new Error(`向量条数对不上：${vectors.length} vs ${CHILDREN.length}`);
  }

  indexed = CHILDREN.map((child, idx) => ({
    ...child,
    vector: vectors[idx],
  }));
  indexBuilt = true;
  builtAt = new Date().toISOString();
  buildDurationMs = Date.now() - started;

  const status: IndexStatus = {
    built: true,
    childCount: indexed.length,
    builtAt,
    buildDurationMs,
    vectorsDim: vectorDim(vectors),
    provider: llm.provider,
    embeddingModel: llm.embeddingModel,
  };

  logger.info(
    "buildIndex",
    "调用函数结束：buildIndex",
    "为什么：6 个子块都已变成向量存进内存；检索时只算问句向量。当前：建库完成。",
    {
      返回值: status,
      耗时ms: buildDurationMs,
    },
  );

  return status;
}

/** 检索前检查：索引未建则 throw NO_INDEX；不再 lazy 自动建库。 */
export function ensureIndex(): void {
  if (!indexBuilt) {
    throw new Error(
      "NO_INDEX：向量库还没建；请先点页面上「建库」按钮或调 POST /api/build-index",
    );
  }
}