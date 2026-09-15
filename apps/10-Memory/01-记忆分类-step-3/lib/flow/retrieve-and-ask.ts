/**
 * 职责：检索 + 拼 Prompt + 调对话模型。POST /api/ask 走这条；POST /api/retrieve 不调对话模型，走 retrieve-and-compose.ts。
 * 本步核心：检索 + 拼 Prompt + 调大模型（POST /api/ask 走这条）。
 *
 * 数据流：
 *   { query }
 *     → runRetrieval(query, topK, threshold)：嵌入 + 余弦 + 阈值弃权（共享一段，见 retrieve-score.ts）
 *     → composeMessages(query, finalTop)：拼好 system + user
 *     → 调协议 A 对话补全（带完整 messages）
 *     → JSON.parse(content) → 拿 answer
 *     → 返回 { 候选池, Top-K, 拼好的 Prompt, 完整 modelRequest, 完整 modelResponse, 模型回答, 嵌入维度, 阈值弃权信息, 总耗时 }
 *
 * 为什么单独成文件：retrieve-and-compose.ts 只放 retrieveOnly（不调对话模型），本文件放 askWithRetrieval（调对话模型）。
 * 共享的「嵌入 + 余弦 + 阈值弃权」一段在 retrieve-score.ts 的 runRetrieval 里。
 */
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";
import {
  runRetrieval,
  currentDim,
  DEFAULT_SCORE_THRESHOLD,
  type ScoredFact,
  type ThresholdRejection,
} from "./retrieve-score.js";
import { composeMessages, AskOutputSchema, stripWrap } from "./retrieve-prompt.js";
import { DEFAULT_TOP_K, type CandidatePool, type RetrieveOnlyOptions, buildDisableSet } from "./retrieve-and-compose.js";
import type { PersistedFact } from "../storage/facts-store.js";

// ── 顶层函数：检索 + 拼 Prompt + 调大模型（POST /api/ask 走这条） ──
export interface AskWithRetrievalOutput {
  query: string;
  topK: ScoredFact[];
  candidatePool: CandidatePool;
  /** 被 toggle 排除掉的原始条目（让学习者看到「开关关掉时哪些本来会被召回」） */
  excludedPool: { facts: PersistedFact[] };
  /** 当前 toggle 把哪些类别关掉了 */
  disabledMemoryTypes: string[];
  messages: Array<{ role: "system" | "user"; content: string }>;
  modelRequest: unknown;
  modelResponse: unknown;
  modelAnswer: string;
  embeddingDim: number | null;
  /** 阈值弃权信息：Top-1 低于阈值时附带原始 Top-1 + 阈值 */
  thresholdRejection: ThresholdRejection | null;
  durationMs: number;
}

export async function askWithRetrieval(
  query: string,
  topK: number = DEFAULT_TOP_K,
  opts: RetrieveOnlyOptions = {},
): Promise<AskWithRetrievalOutput> {
  const llm = getLlm();

  const t0 = Date.now();
  const { set: disableMemoryTypes, list: disabledMemoryTypes } = buildDisableSet(opts);
  logger.info(
    "│ 检索-嵌入召回",
    "调用函数开始：askWithRetrieval",
    "为什么写这条日志：路由只认这一层的返回值，里面那次调对话补全才是真发网络请求（看下一条「调用模型开始：对话补全」）。当前：收到一句问句，准备先嵌入再算余弦再拼 Prompt 再调对话模型；本次走了哪些类别、关掉了哪些。",
    { 入参: { query, topK, disabledMemoryTypes }, __code: "const out = await askWithRetrieval(query, topK, opts);" },
  );

  // 1. 共享一段：嵌入 + 余弦 + Top-K + 阈值弃权
  const { pool, excludedPool, finalTop, thresholdRejection } = await runRetrieval(
    query,
    topK,
    DEFAULT_SCORE_THRESHOLD,
    disableMemoryTypes,
  );

  // 2. 拼 messages（用过滤后的 Top-K）
  const messages = composeMessages(query, finalTop);

  // 3. 调大模型（真发网络请求）
  const request = {
    model: llm.modelA,
    messages,
    temperature: 0,
  };
  const t1 = Date.now();
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全",
    `为什么写这条日志：这是真发网络请求的那一次，模型要按筛出的事实回答、不能瞎编。当前：已经把 Top-K=${finalTop.length} 条事实拼进 system，正在请求模型回答「${query}」。`,
    { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );

  const response = await llm.openai.chat.completions.create(request);
  const modelDurationMs = Date.now() - t1;

  logger.info(
    "││ 调用模型-对话补全",
    "调用模型结束：对话补全",
    "为什么写这条日志：要把 content 解析成最终回答交给页面。当前：await 已返回，下一步 JSON.parse。",
    {
      返回值: response,
      耗时ms: modelDurationMs,
      字段释义: {
        "choices[0].message.content": "模型最终回答（含引用了哪几条事实）",
        "choices[0].finish_reason": "stop = 模型认为输出已经完整",
        usage: "这一次调用消耗的 token 数（prompt + completion）",
      },
    },
  );

  // 4. 解析回答（不强求 JSON；只接受纯文本作答）
  const content = response.choices[0]?.message?.content ?? "";
  const cleaned = stripWrap(content);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch {
    // 模型没按 JSON 输出——把整段纯文本当作 answer（友好兜底）
    parsedJson = { answer: cleaned };
  }
  const { answer } = AskOutputSchema.parse(parsedJson);

  const output: AskWithRetrievalOutput = {
    query,
    topK: finalTop,
    candidatePool: { facts: pool.facts, filePath: pool.filePath },
    excludedPool,
    disabledMemoryTypes,
    messages,
    modelRequest: request,
    modelResponse: response,
    modelAnswer: answer,
    embeddingDim: currentDim(),
    thresholdRejection,
    durationMs: Date.now() - t0,
  };

  logger.info(
    "│ 检索-嵌入召回",
    "调用函数结束：askWithRetrieval",
    "为什么写这条日志：让页面拿到完整请求/响应 + 模型回答 + toggle 状态 + 被排除的类别对照，方便学习者核对「筛出的事实 + Prompt + 模型回答」是否对得上。当前：即将返回给路由。",
    {
      返回值: {
        query,
        candidateCount: pool.facts.length,
        excludedCount: excludedPool.facts.length,
        disabledMemoryTypes,
        embeddingDim: currentDim(),
        finalTopK: finalTop.map((s) => ({ score: s.score, key: s.fact.key, sentence: s.factSentence })),
        thresholdRejection: thresholdRejection
          ? { topScore: thresholdRejection.topScore, threshold: thresholdRejection.threshold, rejectedKey: thresholdRejection.rejectedTop.fact.key }
          : null,
        modelAnswer: answer,
        durationMs: Date.now() - t0,
      },
      耗时ms: Date.now() - t0,
      字段释义: {
        candidateCount: "过滤后事实库总条数",
        excludedCount: "因 toggle 被排除掉的条数",
        disabledMemoryTypes: "本次关掉的记忆类别列表",
        embeddingDim: "嵌入向量的维度",
        finalTopK: "阈值过滤后的 Top-K",
        thresholdRejection: "Top-1 score < 阈值时的弃权信息",
        modelAnswer: "模型基于筛出的事实在 system 里给出的最终回答",
        durationMs: "整条链路（含嵌入 + 余弦 + 拼 Prompt + 调对话模型 + 解析）总耗时",
      },
    },
  );

  return output;
}

// 显式 re-export 让上层一次 import 拿到所有
export { DEFAULT_TOP_K } from "./retrieve-and-compose.js";
export type { PersistedFact };
