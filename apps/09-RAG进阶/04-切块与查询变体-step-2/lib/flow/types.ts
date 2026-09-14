/**
 * 职责：parent-child 主流程相关的对外类型（ModelRequestTrace / ModelResponseTrace /
 *       QueryEmbedSummary / ParentFeed / ParentChildResult）。
 *       拆出来是为了让 parent-child-retrieve.ts 保持 ≤ 280 行（§5.3.8）。
 */
import type { ScoredChild } from "../corpus/score-children.js";
import type { IndexStatus } from "../corpus/vector-index.js";

export type ParentFeed = {
  id: string;
  title: string;
  text: string;
  hitChildIds: string[];
};

/** 检索时算问句向量的摘要（前端可看）。完整向量不返给前端——避免响应过大。 */
export type QueryEmbedSummary = {
  provider: string;
  model: string;
  vectorDim: number;
  durationMs: number;
  /** 第一维度的前 8 个数值（预览；完整向量本地留用） */
  firstEightDims: number[];
};

/** 模型请求的可观察痕迹：发给 OpenAI Chat Completions 的完整 messages。 */
export type ModelRequestTrace = {
  model: string;
  temperature: number;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
};

/** 模型响应的可观察痕迹：content、停止原因、token 消耗。 */
export type ModelResponseTrace = {
  finishReason: string;
  content: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export type ParentChildResult = {
  query: string;
  topK: number;
  /** 命中后实际喂给 HitAndFeed 左栏的子块（topK 内，isHit=true） */
  childHits: ScoredChild[];
  /** 全部 6 个子块的余弦相似度 + 排名 + isHit；喂给 ChildCoverage 卡片做完整覆盖展示 */
  allChildren: ScoredChild[];
  parentsFed: ParentFeed[];
  duplicateChildIdsDropped: string[];
  /** 检索时调嵌入接口的摘要（前端可看） */
  queryEmbed: QueryEmbedSummary;
  /** 向量索引状态（前端可看） */
  indexStatus: IndexStatus;
  modelRequest: ModelRequestTrace;
  modelResponse: ModelResponseTrace;
  reply: string;
  model: string;
};

export type QueryVariantsTrace = {
  model: string;
  temperature: number;
  rawContent: string;
  variants: string[];
  /** 多路问句生成的原始请求（前端可看「模型实际收到的提示词」） */
  request: {
    model: string;
    temperature: number;
    messages: Array<{ role: "system" | "user"; content: string }>;
    prompt: string;
  };
  /** 多路问句生成的原始响应（前端可看模型实际返回 + 拆好的 N 行） */
  response: {
    rawContent: string;
    variants: string[];
    finishReason: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  };
};

export type MultiQueryResult = {
  query: string;
  topK: number;
  numQueries: number;
  queryVariants: string[];
  queryVariantsRequest?: QueryVariantsTrace["request"];
  queryVariantsResponse?: QueryVariantsTrace["response"];
  queryVariantsEmbed: { provider: string; model: string; vectorDim: number; durationMs: number };
  perQueryHits: Array<{ query: string; childHits: ScoredChild[] }>;
  rrfMerged: ScoredChild[];
  parentsFed: ParentFeed[];
  duplicateChildIdsDropped: string[];
  modelRequest: ModelRequestTrace;
  modelResponse: ModelResponseTrace;
  reply: string;
  model: string;
};