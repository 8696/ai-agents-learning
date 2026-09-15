/**
 * 职责：只检索 + 拼 Prompt，不调对话模型。POST /api/retrieve 走这条；POST /api/ask 走 retrieve-and-ask.ts。
 * 本步核心：检索 / 按相关性召回 + 拼进 Prompt。
 *
 * 数据流（POST /api/retrieve）：被路由 retrieve.ts 调用，不调对话模型；
 *   数据流（POST /api/ask）：检索 + 拼 Prompt + 调对话模型 —— 走 lib/flow/retrieve-and-ask.ts。
 *
 * 本文件只负责 retrieveOnly 这一条路径：嵌入 + 余弦 + 阈值弃权 + 拼 Prompt，不调对话模型。
 * 共享的「嵌入 + 余弦 + 阈值弃权」一段在 lib/flow/retrieve-score.ts 的 runRetrieval 里。
 *
 * 数据流（POST /api/retrieve）：
 *   { query }
 *     → runRetrieval(query, topK, threshold)：嵌入 + 余弦 + 阈值弃权
 *     → composeMessages(query, finalTop)：拼好 system + user
 *     → 返回 { 候选池, Top-K, 拼好的 Prompt, 嵌入维度, 阈值弃权信息 }
 *
 * 为什么用嵌入向量做召回：jieba / 关键词检索对「我住哪个城市」vs「我是深圳人」这种语义近但词不同的事实召回不到；
 * 嵌入模型把句子变成稠密向量，「我住哪个城市」和「我是深圳人」在向量空间里方向接近，余弦相似度能召回。
 */
import { logger } from "../logger.js";
import {
  runRetrieval,
  currentDim,
  DEFAULT_SCORE_THRESHOLD,
  type ScoredFact,
} from "./retrieve-score.js";
import type { PersistedFact } from "../storage/facts-store.js";
import { composeMessages } from "./retrieve-prompt.js";

/** 默认召回条数：三条够看见「筛过」又够看见「为什么是这三条」 */
export const DEFAULT_TOP_K = 3;

/** 把候选池里的所有事实原样返回（不截断），便于上层展示「候选池有多大」 */
export interface CandidatePool {
  facts: PersistedFact[];
  filePath: string;
}

/** 阈值弃权信息（从 retrieve-score.ts re-export，方便上层一次 import） */
export type { ThresholdRejection } from "./retrieve-score.js";

// ── 顶层函数：只检索 + 拼 Prompt（POST /api/retrieve 走这条，不调对话模型） ──
export interface RetrieveOnlyOutput {
  query: string;
  topK: ScoredFact[];
  candidatePool: CandidatePool;
  /** 被 toggle 排除掉的原始条目（关掉的记忆类别整组不进余弦，单独放这里给页面看对照） */
  excludedPool: { facts: PersistedFact[] };
  /** 当前 toggle 把哪些类别关掉了；供页面顶部展示「本次召回用了 N 个类别，关掉了 X 个」 */
  disabledMemoryTypes: string[];
  messages: Array<{ role: "system" | "user"; content: string }>;
  embeddingDim: number | null;
  /** 阈值弃权信息：Top-1 低于阈值时附带原始 Top-1 + 阈值，页面可见「为什么 Top-K 为空」 */
  thresholdRejection: import("./retrieve-score.js").ThresholdRejection | null;
}

/** 业务开关入参：disableEpisodic 关掉情景记忆 / disableSemantic 关掉语义记忆 */
export interface RetrieveOnlyOptions {
  disableEpisodic?: boolean;
  disableSemantic?: boolean;
}

export function buildDisableSet(opts: RetrieveOnlyOptions): { set: Set<string>; list: string[] } {
  const set = new Set<string>();
  const list: string[] = [];
  if (opts.disableEpisodic) {
    set.add("情景记忆");
    list.push("情景记忆");
  }
  if (opts.disableSemantic) {
    set.add("语义记忆");
    list.push("语义记忆");
  }
  return { set, list };
}

export async function retrieveOnly(
  query: string,
  topK: number = DEFAULT_TOP_K,
  opts: RetrieveOnlyOptions = {},
): Promise<RetrieveOnlyOutput> {
  const t0 = Date.now();
  const { set: disableMemoryTypes, list: disabledMemoryTypes } = buildDisableSet(opts);
  logger.info(
    "│ 检索-嵌入召回",
    "调用函数开始：retrieveOnly",
    "为什么写这条日志：让页面看到「只检索不调对话模型」这条路径上发生了什么；本次走了哪些记忆类别、关掉了哪些。当前：收到一句问句，准备调嵌入接口把问句和事实库都变成向量，再算余弦取 Top-K。",
    { 入参: { query, topK, disabledMemoryTypes }, __code: "const out = await retrieveOnly(query, topK, opts);" },
  );

  // 1. 嵌入 + 余弦 + Top-K + 阈值弃权（共享一段；ask 路径也走这一段）
  const { pool, excludedPool, rawTop, finalTop, thresholdRejection } = await runRetrieval(
    query,
    topK,
    DEFAULT_SCORE_THRESHOLD,
    disableMemoryTypes,
  );

  // 2. 拼 Prompt（用过滤后的 Top-K；为空时 system 段会写明「没有任何一条相关」）
  const messages = composeMessages(query, finalTop);

  const output: RetrieveOnlyOutput = {
    query,
    topK: finalTop,
    candidatePool: { facts: pool.facts, filePath: pool.filePath },
    excludedPool,
    disabledMemoryTypes,
    messages,
    embeddingDim: currentDim(),
    thresholdRejection,
  };

  logger.info(
    "│ 检索-嵌入召回",
    "调用函数结束：retrieveOnly",
    "为什么写这条日志：让页面看到候选池大小、Top-K、拼好的 Prompt、嵌入维度、阈值弃权信息，方便核对「为什么筛出来的是这三条 / 为什么 Top-K 是空 / 关掉了哪些类别」。当前：即将返回，不调对话模型。",
    {
      返回值: {
        query,
        candidateCount: pool.facts.length,
        excludedCount: excludedPool.facts.length,
        disabledMemoryTypes,
        embeddingDim: currentDim(),
        rawTopK: rawTop.map((s) => ({ score: s.score, key: s.fact.key, sentence: s.factSentence })),
        finalTopK: finalTop.map((s) => ({ score: s.score, key: s.fact.key, sentence: s.factSentence })),
        thresholdRejection: thresholdRejection
          ? { topScore: thresholdRejection.topScore, threshold: thresholdRejection.threshold, rejectedKey: thresholdRejection.rejectedTop.fact.key }
          : null,
        messagesPreview: messages.map((m) => ({ role: m.role, contentLength: m.content.length })),
      },
      耗时ms: Date.now() - t0,
      字段释义: {
        candidateCount: "过滤后事实库里有多少条候选",
        excludedCount: "因 toggle 被排除掉的条数（关掉的类别）",
        disabledMemoryTypes: "本次关掉的记忆类别列表",
        rawTopK: "排序后的原始 Top-K（未经阈值过滤）",
        finalTopK: "阈值过滤后的 Top-K（页面看到的）",
        thresholdRejection: "Top-1 score < 阈值时的弃权信息（包含被弃的 Top-1 分数 + 阈值 + key）",
        messagesPreview: "拼好的两条 messages 的角色 + 字符数（完整内容仍放在 messages 字段给页面）",
      },
    },
  );

  return output;
}