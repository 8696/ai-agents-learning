/**
 * 职责：一次请求怎么把四类记忆拼进 messages（行业两层读取，不是「所有长期记忆都按问句 Top-K」）。
 *
 * 本步核心：
 *   ① 程序性记忆 → 全员规则，常驻 system，不检索
 *   ② 核心用户画像 → 语义记忆·长期，常驻 system，不按问句筛（ChatGPT 已保存记忆 / Letta 的 human 块）
 *   ③ 本轮相关经历 → 只检索情景记忆，Top-K 只活在这一次请求，下一问整块替换（Letta 档案记忆）
 *   ④ 工作记忆 → 前端传来的 user / assistant 历史，本来就在上下文窗口里
 *
 * 数据流（POST /api/chat）：路由只校验入参；本文件串拼装 + 调对话补全。
 *
 * 开关：
 *   - skipRecall / 问句本身不需要翻经历 → 跳过 ③，①② 仍带
 *   - disableSemantic → 不注入核心用户画像（对照：问框架会不会忘 Vue）
 *   - disableEpisodic → 情景不进检索池
 */
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";
import { runRetrieval } from "./retrieve-score.js";
import { composeSystemContent, shouldSearchEpisodes } from "./retrieve-prompt.js";
import { listRules } from "../storage/program-rules.js";
import { listFacts } from "../storage/facts-store.js";
import type { ScoredFact } from "./retrieve-score.js";
import type { PersistedFact } from "../storage/facts-store.js";
import type { ThresholdRejection } from "./retrieve-score.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 业务开关：只影响下一次请求的读取策略 */
export interface PipelineToggles {
  /** 跳过本轮情景召回；核心用户画像仍常驻 */
  skipRecall?: boolean;
  /** 不注入核心用户画像（对照用） */
  disableSemantic?: boolean;
  /** 情景记忆不进检索池 */
  disableEpisodic?: boolean;
}

export interface FullPipelineInput {
  /** 当前多轮历史（含最新一条 user；前端累计传进来） */
  messages: ChatMessage[];
  /** 最新一条 user 原文（用于「这条要不要召回」单独打日志） */
  currentQuery: string;
  toggles?: PipelineToggles;
}

export interface FullPipelineOutput {
  /** 拼好发给模型的消息数组（system = ①②③，其后是工作记忆历史） */
  finalMessages: ChatMessage[];
  /** ① 程序性记忆条数 */
  programRuleCount: number;
  /** ② 核心用户画像（语义记忆·长期，本轮常驻、不按问句筛） */
  coreProfile: PersistedFact[];
  /** ③ 本轮情景召回：只含经历，不含语义画像 */
  recall: {
    pool: { facts: PersistedFact[]; filePath: string };
    excludedPool: { facts: PersistedFact[] };
    topK: ScoredFact[];
    thresholdRejection: ThresholdRejection | null;
    skipped: boolean;
    skipReason: string;
  };
  modelRequest: unknown;
  modelResponse: unknown;
  modelAnswer: string;
  durationMs: number;
}

/**
 * 一次请求的拼装 + 调对话模型。
 * 这是 step-4 唯一的对外函数；route chat.ts 直接调它。
 */
export async function runFullPipeline(input: FullPipelineInput): Promise<FullPipelineOutput> {
  const llm = getLlm();
  const toggles = input.toggles ?? {};
  const t0 = Date.now();
  logger.info(
    "│ 主流程-拼装",
    "调用函数开始：runFullPipeline",
    "为什么写这条日志：让页面看到本次请求走了哪几道拼装 + 调对话模型；本步是 step-4 的核心。当前：收到多轮 messages + 最新一条 user + 开关状态。",
    {
      入参: {
        historyLength: input.messages.length,
        currentQuery: input.currentQuery,
        toggles,
      },
      __code: "const out = await runFullPipeline({ messages, currentQuery, toggles });",
    },
  );

  // ── ① 程序性记忆常驻：不检索、从内存读 ──
  const programRules = listRules();
  const programBlock =
    programRules.length === 0
      ? "（当前没有任何全员规则）"
      : programRules.map((r, i) => `[全员规则 ${i + 1}] ${r.text}`).join("\n");

  // ── ② 核心用户画像：语义记忆·长期整份常驻，不按问句筛 ──
  const listed = listFacts();
  const allFacts = listed.facts;
  const coreProfile: PersistedFact[] = toggles.disableSemantic
    ? []
    : allFacts.filter((f) => f.memoryType === "语义记忆" && f.term === "长期");
  const episodicFacts = allFacts.filter((f) => f.memoryType === "情景记忆");

  // ── ③ 本轮情景召回：只翻经历；语义画像不进余弦 ──
  let topK: ScoredFact[] = [];
  let excludedPool: { facts: PersistedFact[] } = { facts: [] };
  let pool: { facts: PersistedFact[]; filePath: string } = { facts: episodicFacts, filePath: listed.filePath };
  let thresholdRejection: ThresholdRejection | null = null;
  const heuristic = shouldSearchEpisodes(input.currentQuery);
  const skipEpisodes = Boolean(toggles.skipRecall) || Boolean(toggles.disableEpisodic) || !heuristic.search;
  const skipReason = toggles.skipRecall
    ? "页面勾了「跳过本轮情景召回」"
    : toggles.disableEpisodic
      ? "页面关掉了情景记忆"
      : heuristic.search
        ? ""
        : heuristic.reason;
  if (skipEpisodes) {
    logger.info(
      "│ 主流程-拼装",
      "│ ③ 情景召回-跳过",
      "为什么写这条日志：情景检索可以按问句跳过；核心用户画像仍常驻。当前：记录跳过原因。",
      { 入参: { skipRecall: toggles.skipRecall, disableEpisodic: toggles.disableEpisodic, heuristic }, __code: "skipEpisodes = true;" },
    );
  } else {
    const disableSet = new Set<string>(["语义记忆", "工作记忆", "程序性记忆"]);
    const r = await runRetrieval(input.currentQuery, 3, 0.1, disableSet);
    pool = { facts: r.pool.facts, filePath: r.pool.filePath };
    excludedPool = r.excludedPool;
    topK = r.finalTop;
    thresholdRejection = r.thresholdRejection;
    logger.info(
      "│ 主流程-拼装",
      "│ ③ 情景召回-完成",
      "为什么写这条日志：让页面看到本轮只对情景记忆跑了嵌入余弦，语义画像不在候选池里。",
      {
        入参: { query: input.currentQuery, disableMemoryTypes: [...disableSet] },
        返回值: {
          candidateCount: pool.facts.length,
          excludedCount: excludedPool.facts.length,
          topKSize: topK.length,
          thresholdRejection: thresholdRejection
            ? {
                topScore: thresholdRejection.topScore,
                threshold: thresholdRejection.threshold,
                rejectedKey: thresholdRejection.rejectedTop.fact.key,
              }
            : null,
        },
      },
    );
  }

  const systemContent = composeSystemContent({
    programBlock,
    coreFacts: coreProfile,
    episodicSkipped: skipEpisodes,
    episodicSkipReason: skipReason,
    episodicTopK: topK,
  });

  // 4 步拼成完整 messages
  // 保留前端的 history（多轮 user / assistant 轮次），但要替换或注入 system 段
  // 设计：把前端 messages 里第一条 system 替换为我们的 4 步拼接结果；若前端没传 system 则 prepend
  const historyNoSystem = input.messages.filter((m) => m.role !== "system");
  const finalMessages: ChatMessage[] = [
    { role: "system", content: systemContent },
    ...historyNoSystem,
  ];

  const request = {
    model: llm.modelA,
    messages: finalMessages,
    temperature: 0,
  };

  // ── ④ 调对话模型 ──
  const t1 = Date.now();
  logger.info(
    "││ 主流程-调对话模型",
    "调用模型开始：对话补全",
    `为什么写这条日志：真发网络请求的那一次。拼装已就位（① 程序性 ${programRules.length} 条 / ② 核心画像 ${coreProfile.length} 条 / ③ 本轮经历 ${topK.length} 条 / ④ 工作记忆 ${historyNoSystem.length} 条 history），现在请模型回答「${input.currentQuery}」。`,
    { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );

  const response = await llm.openai.chat.completions.create(request);
  const modelDurationMs = Date.now() - t1;

  logger.info(
    "││ 主流程-调对话模型",
    "调用模型结束：对话补全",
    "为什么写这条日志：要把 content 解析成最终回答交给页面；这一层不要求 JSON（纯文本作答更友好）。当前：await 已返回，下一步提取 answer。",
    {
      返回值: response,
      耗时ms: modelDurationMs,
      字段释义: {
        "choices[0].message.content": "模型最终回答",
        "choices[0].finish_reason": "stop = 模型认为输出已经完整",
        usage: "这一次调用消耗的 token 数（prompt + completion）",
      },
    },
  );

  const content = response.choices[0]?.message?.content ?? "";
  const modelAnswer = String(content).trim();

  const output: FullPipelineOutput = {
    finalMessages,
    programRuleCount: programRules.length,
    coreProfile,
    recall: {
      pool,
      excludedPool,
      topK,
      thresholdRejection,
      skipped: skipEpisodes,
      skipReason,
    },
    modelRequest: request,
    modelResponse: response,
    modelAnswer,
    durationMs: Date.now() - t0,
  };

  logger.info(
    "│ 主流程-拼装",
    "调用函数结束：runFullPipeline",
    "为什么写这条日志：让页面拿到完整拼装结果 + 完整请求/响应 + 模型回答。当前：即将返回给路由。",
    {
      返回值: {
        historyLength: input.messages.length,
        programRuleCount: programRules.length,
        coreProfileCount: coreProfile.length,
        recallSize: topK.length,
        recallSkipped: skipEpisodes,
        skipReason,
        answerPreview: modelAnswer.slice(0, 80),
        durationMs: Date.now() - t0,
      },
      耗时ms: Date.now() - t0,
    },
  );

  return output;
}