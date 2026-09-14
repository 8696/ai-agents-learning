/**
 * 本步核心：父子切块检索——子块负责搜得准，命中后取出父块喂给模型。
 * 职责：问句 → 算问句向量 → 在已建好的向量索引上跑余弦相似度排序
 *       → 按 parentId 取父块并去重 → 用父块全文调一次对话补全。
 *
 * 数据流：scoreIndexed（本地，已建索引）→ 去重父块 → getLlmOptional
 *       → openai.chat.completions.create（对话补全）。
 *
 * 「建库」（6 个子块转向量存索引）是另一步，详 lib/corpus/vector-index.ts。
 * 本文件是「检索」主流程。
 */
import { getLlmOptional } from "../../../../llm.js";
import { logger } from "../logger.js";
import { parentById } from "../corpus/handbook.js";
import { scoreIndexed, type ScoredChild } from "../corpus/score-children.js";
import { ensureIndex, getIndexStatus } from "../corpus/vector-index.js";
import { fetchEmbeddings, vectorDim } from "../corpus/embed-client.js";
import type {
  ParentChildResult,
  ParentFeed,
  ModelRequestTrace,
  ModelResponseTrace,
  QueryEmbedSummary,
} from "./types.js";

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

async function callLlmOnce(params: {
  query: string;
  parentsFed: ParentFeed[];
}): Promise<{
  reply: string;
  model: string;
  raw: unknown;
  modelRequest: ModelRequestTrace;
  modelResponse: ModelResponseTrace;
}> {
  const started = Date.now();
  logger.info(
    "││ callLlmOnce",
    "调用函数开始：callLlmOnce",
    "为什么：生成必须读父块全文，不能只读 150 字子块。当前：准备对话补全；里面那次才是真发网络请求。",
    {
      __code: callLlmOnce.toString(),
      入参: params,
    },
  );

  const llm = getLlmOptional();
  if (!llm) {
    const err = new Error("NO_KEY");
    logger.info(
      "││ callLlmOnce",
      "调用函数结束：callLlmOnce（失败）",
      "为什么：没有密钥就不能冒充模型回答。当前：getLlmOptional 返回空。",
      { 返回值: { error: "NO_KEY" }, 耗时ms: Date.now() - started },
    );
    throw err;
  }

  const materials = params.parentsFed
    .map((item) => `【${item.id} ${item.title}】\n${item.text}`)
    .join("\n\n");
  const messages = [
    {
      role: "system" as const,
      content:
        "你是售后助手。只根据下面「将喂给模型的父块」回答。" +
        "父块里没有的规则不要编。回答末尾用 [id=父块id] 标出来源。",
    },
    {
      role: "user" as const,
      content: `用户原句：${params.query}\n\n将喂给模型的父块：\n${materials}`,
    },
  ];

  logger.info(
    "│││ 对话补全",
    "调用模型开始：对话补全",
    "为什么：要用父块全文生成可见答复，对照「子块太短会缺物流保单号」。当前：真发网络请求。",
    {
      __code: "openai.chat.completions.create",
      入参: { model: llm.modelA, messages },
    },
  );

  const completion = await llm.openai.chat.completions.create({
    model: llm.modelA,
    messages,
    temperature: 0,
  });

  const reply = completion.choices[0]?.message?.content ?? "";
  logger.info(
    "│││ 对话补全",
    "调用模型结束：对话补全",
    "为什么：把完整返回对象留下，事后能对上 finish_reason 和正文。当前：模型已返回。",
    {
      返回值: completion,
      字段释义: {
        "choices[0].message.content": "模型给用户看的答复正文",
        finish_reason: "这次为什么停，本步期望 stop",
      },
      耗时ms: Date.now() - started,
    },
  );

  const usage = completion.usage;
  const modelRequest: ModelRequestTrace = {
    model: llm.modelA,
    temperature: 0,
    messages,
  };
  const modelResponse: ModelResponseTrace = {
    finishReason: completion.choices[0]?.finish_reason ?? "unknown",
    content: reply,
    usage: usage ? {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    } : undefined,
  };

  logger.info(
    "││ callLlmOnce",
    "调用函数结束：callLlmOnce",
    "为什么：把对话补全的正文交回主流程。当前：生成结束。",
    {
      返回值: { reply, model: llm.modelA },
      耗时ms: Date.now() - started,
    },
  );

  return { reply, model: llm.modelA, raw: completion, modelRequest, modelResponse };
}

export async function parentChildRetrieve(input: {
  query: string;
  topK: number;
}): Promise<ParentChildResult> {
  const started = Date.now();
  const llm = getLlmOptional();
  if (!llm) throw new Error("NO_KEY");
  if (!llm.embeddingModel) {
    throw new Error(`当前提供商 ${llm.provider} 没有默认嵌入模型；请在 apps/.env 设 LLM_EMBEDDING_MODEL，或换 LLM_PROVIDER。`);
  }

  logger.info(
    "parentChildRetrieve",
    "调用函数开始：parentChildRetrieve",
    "为什么：本步要让人看见「建库 → 检索 → 同父去重 → 调对话补全」四步。当前：入口；如果索引还没建，懒加载建一次。",
    {
      __code: parentChildRetrieve.toString(),
      入参: input,
    },
  );

  // 第 1 步：确保向量索引已建好（懒加载；应用启动时通常已自动建）
  await ensureIndex();
  const indexStatus = getIndexStatus();

  // 第 2 步：检索时只算问句向量（1 条）；不再是「所有 6 个子块都重新算」
  const embedStarted = Date.now();
  const [queryVecArr] = await fetchEmbeddings(llm, [input.query]);
  const queryVec = queryVecArr ?? [];
  const queryEmbed: QueryEmbedSummary = {
    provider: llm.provider,
    model: llm.embeddingModel,
    vectorDim: vectorDim([queryVec]),
    durationMs: Date.now() - embedStarted,
    firstEightDims: queryVec.slice(0, 8),
  };

  // 第 3 步：在已建好的索引上跑余弦相似度（纯本地，不再调嵌入）
  const allScored = scoreIndexed(queryVec, input.topK);
  const childHits = allScored.filter((item) => item.isHit);

  // 第 4 步：同父去重，取父块
  const { parentsFed, duplicateChildIdsDropped } = uniqueParents(childHits);

  // 第 5 步：调对话补全
  const generated = await callLlmOnce({ query: input.query, parentsFed });

  const result: ParentChildResult = {
    query: input.query,
    topK: input.topK,
    childHits,
    allChildren: allScored,
    parentsFed,
    duplicateChildIdsDropped,
    queryEmbed,
    indexStatus,
    modelRequest: generated.modelRequest,
    modelResponse: generated.modelResponse,
    reply: generated.reply,
    model: generated.model,
  };

  logger.info(
    "parentChildRetrieve",
    "调用函数结束：parentChildRetrieve",
    "为什么：把索引状态、问句向量摘要、命中子块、去重后的父块、模型答复一起交出去。当前：主流程结束。",
    {
      返回值: result,
      耗时ms: Date.now() - started,
    },
  );
  return result;
}