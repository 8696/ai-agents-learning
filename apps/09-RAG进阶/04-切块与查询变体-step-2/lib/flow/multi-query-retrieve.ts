/**
 * 职责 · 本步核心：多路查询（Multi-query Retrieval）——一条问句可能只覆盖一个语义邻域，
 *       让模型生成 N 条不同说法的检索问句、分别搜、再合并。
 * 职责：用户原句 → 模型生成 N 条问句 → 每条问句算 embedding → 在已建好的向量索引上
 *       各自跑余弦相似度取 topK → RRF（Reciprocal Rank Fusion）合并 → 同 parentId 去重
 *       → 取父块 → 调对话补全 → 答复。
 *
 * 数据流：generateQueryVariants（lib/flow/llm-calls.ts）→ scoreIndexed × N
 *       → rrfMerge（lib/corpus/rrf.ts）→ uniqueParents → generateAnswer（同 llm-calls.ts）。
 *       「调大模型」两次都封装在 llm-calls.ts 里；route 里没有 while / 真调模型。
 *
 * 为什么单独成文件：检索「编排」这一步独立于「建库」「按 parentId 取父块」「调对话补全」，
 * 改打分 / 合并算法只动这一处。
 */
import { getLlmOptional } from "../../../../llm.js";
import { logger } from "../logger.js";
import { parentById } from "../corpus/handbook.js";
import { scoreIndexed, type ScoredChild } from "../corpus/score-children.js";
import { ensureIndex } from "../corpus/vector-index.js";
import { fetchEmbeddings } from "../corpus/embed-client.js";
import { rrfMerge } from "../corpus/rrf.js";
import { generateQueryVariants, generateAnswer } from "./llm-calls.js";
import type { ParentFeed, MultiQueryResult } from "./types.js";

function uniqueParents(hits: ScoredChild[]): {
  parentsFed: ParentFeed[];
  duplicateChildIdsDropped: string[];
} {
  const order: string[] = [];
  const grouped = new Map<string, string[]>();
  const duplicateChildIdsDropped: string[] = [];
  for (const hit of hits) {
    const existing = grouped.get(hit.parentId);
    if (existing) {
      existing.push(hit.id);
      duplicateChildIdsDropped.push(hit.id);
    } else {
      grouped.set(hit.parentId, [hit.id]);
      order.push(hit.parentId);
    }
  }
  const parentsFed: ParentFeed[] = [];
  for (const parentId of order) {
    const parent = parentById(parentId);
    if (!parent) continue;
    parentsFed.push({
      id: parent.id,
      title: parent.title,
      text: parent.text,
      hitChildIds: grouped.get(parentId) ?? [],
    });
  }
  return { parentsFed, duplicateChildIdsDropped };
}

export async function multiQueryRetrieve(input: {
  query: string;
  topK: number;
  numQueries: number;
}): Promise<MultiQueryResult> {
  const started = Date.now();
  const llm = getLlmOptional();
  if (!llm) throw new Error("NO_KEY");
  if (!llm.embeddingModel) {
    throw new Error(`当前提供商 ${llm.provider} 没有默认嵌入模型；请在 apps/.env 设 LLM_EMBEDDING_MODEL，或换 LLM_PROVIDER。`);
  }

  logger.info(
    "multiQueryRetrieve",
    "调用函数开始：multiQueryRetrieve",
    "为什么：本步要让人看见「一条问句 → N 条不同说法的检索问句 → 各搜 → RRF 合并 → 同父去重 → 调对话补全」的全过程。",
    { __code: multiQueryRetrieve.toString(), 入参: input },
  );

  await ensureIndex();

  // 第 1 步：模型生成 N 条不同说法的检索问句（1 次模型调用，封装在 llm-calls.ts）
  const variantsTrace = await generateQueryVariants(llm, input.query, input.numQueries);
  const variants = variantsTrace.variants.length > 0 ? variantsTrace.variants : [input.query];

  // 第 2 步：每条问句算 embedding + 在已建索引上跑余弦相似度排序
  const perQueryHits: Array<{ query: string; childHits: ScoredChild[] }> = [];
  const embedStarted = Date.now();
  const vectorsArr = await fetchEmbeddings(llm, variants);
  const totalEmbedMs = Date.now() - embedStarted;
  for (let i = 0; i < variants.length; i += 1) {
    const queryVec = vectorsArr[i] ?? [];
    perQueryHits.push({ query: variants[i], childHits: scoreIndexed(queryVec, input.topK) });
  }

  // 第 3 步：RRF 合并多路名单（被多路共同命中的切块往上抬）
  const rrfMerged = rrfMerge(perQueryHits.map((p) => p.childHits));

  // 第 4 步：同父去重 + 取父块
  const { parentsFed, duplicateChildIdsDropped } = uniqueParents(rrfMerged);

  // 第 5 步：调对话补全（第 2 次模型调用，封装在 llm-calls.ts）
  const answer = await generateAnswer(llm, input.query, parentsFed);

  const result: MultiQueryResult = {
    query: input.query,
    topK: input.topK,
    numQueries: input.numQueries,
    queryVariants: variants,
    queryVariantsRequest: variantsTrace.request,
    queryVariantsResponse: variantsTrace.response,
    queryVariantsEmbed: {
      provider: llm.provider,
      model: llm.embeddingModel,
      vectorDim: vectorsArr[0]?.length ?? 0,
      durationMs: totalEmbedMs,
    },
    perQueryHits,
    rrfMerged,
    parentsFed,
    duplicateChildIdsDropped,
    modelRequest: answer.modelRequest,
    modelResponse: answer.modelResponse,
    reply: answer.reply,
    model: answer.model,
  };

  logger.info(
    "multiQueryRetrieve",
    "调用函数结束：multiQueryRetrieve",
    "为什么：把 N 条问句、各自命中、RRF 合并、去重父块、模型答复一起交出去。",
    { 返回值: result, 耗时ms: Date.now() - started },
  );
  return result;
}