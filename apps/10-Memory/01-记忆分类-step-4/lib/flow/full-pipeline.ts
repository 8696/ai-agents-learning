/**
 * 职责：完整 4 步串成一次请求的链路（对应 MD §5.4.B「一次请求数据怎么走」）。
 *   ① 程序性记忆常驻 → 不检索，从内存存储读出全部规则，拼进 system 段开头
 *   ② 语义 / 情景召回 → 跑嵌入 + 余弦 + Top-K + 阈值弃权（复用 step-3 的 retrieve-score.runRetrieval）
 *                     → 把 Top-K 拼进 system 段「关于这个用户你需要知道的」
 *   ③ 工作记忆累积 → 多轮 messages 数组（前端传进来，本来就在上下文窗口里，不靠检索）
 *   ④ 拼 messages → 把 ①②③ 串成完整 messages 数组 → 调协议 A 对话补全 → 解析
 *
 * 数据流（POST /api/chat）：被路由 chat.ts 调用，调一次完整 4 步拼装 + 调对话模型。
 *
 * 为什么单独成文件：这是「拼装 + 调模型」一整条主流程；route 只校验入参、调用这一层、按返回上页。
 * 拆分原则见 §5.7「主流程单独成文件」。
 *
 * 每轮独立判断：本 demo 让前端按 5 句连问按钮依次发送 messages 数组。
 *   - 若 toggle.skipRecall === true → 跳过 ②（演示「不读记忆库」分支）
 *   - 若 toggle.disableSemantic / disableEpisodic === true → runRetrieval 过滤对应类别
 *   - ③ 工作记忆永远是 messages 数组本身（前端传进来）
 */
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";
import { runRetrieval } from "./retrieve-score.js";
import { listRules } from "../storage/program-rules.js";
import type { ScoredFact } from "./retrieve-score.js";
import type { PersistedFact } from "../storage/facts-store.js";
import type { ThresholdRejection } from "./retrieve-score.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 业务开关：前端可勾上跳过召回、或关掉某类记忆 */
export interface PipelineToggles {
  /** 跳过整个 ② 召回步骤（演示「不读记忆库」分支） */
  skipRecall?: boolean;
  /** 关掉语义记忆进召回池 */
  disableSemantic?: boolean;
  /** 关掉情景记忆进召回池 */
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
  /** 拼好发给模型的消息数组（含 ① 程序性 + ② 召回 + ③ 工作记忆历史） */
  finalMessages: ChatMessage[];
  /** ① 程序性记忆条数（常驻区大小） */
  programRuleCount: number;
  /** ② 召回结果：候选池 + Top-K + 弃权信息 */
  recall: {
    pool: { facts: PersistedFact[]; filePath: string };
    excludedPool: { facts: PersistedFact[] };
    topK: ScoredFact[];
    thresholdRejection: ThresholdRejection | null;
    skipped: boolean;
  };
  /** 完整模型请求（含 messages），原样交给页面 */
  modelRequest: unknown;
  /** 完整模型响应 */
  modelResponse: unknown;
  /** 模型回答 */
  modelAnswer: string;
  durationMs: number;
}

/**
 * 4 步拼装 + 调对话模型。
 * 这是 step-4 唯一的对外函数；route chat.ts 直接调它。
 */
export async function runFullPipeline(input: FullPipelineInput): Promise<FullPipelineOutput> {
  const llm = getLlm();
  const toggles = input.toggles ?? {};
  const t0 = Date.now();
  logger.info(
    "│ 主流程-4步拼装",
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
      : programRules
          .map((r, i) => `[全员规则 ${i + 1}] ${r.text}`)
          .join("\n");

  // ── ② 语义 / 情景召回 ──
  let topK: ScoredFact[] = [];
  let excludedPool: { facts: PersistedFact[] } = { facts: [] };
  let pool: { facts: PersistedFact[]; filePath: string } = { facts: [], filePath: "" };
  let thresholdRejection: ThresholdRejection | null = null;
  let skipped = false;
  const disableMemoryTypes: string[] = [];
  if (toggles.disableSemantic) disableMemoryTypes.push("语义记忆");
  if (toggles.disableEpisodic) disableMemoryTypes.push("情景记忆");
  const disableSet = new Set(disableMemoryTypes);
  if (toggles.skipRecall) {
    skipped = true;
    logger.info(
      "│ 主流程-4步拼装",
      "│ ② 召回-跳过",
      "为什么写这条日志：前端勾上了 skipRecall，本次不走嵌入余弦，跳过召回步骤（演示「不读记忆库」分支，比如「刚才你说了什么」只看 messages 数组）。",
      { 入参: { skipRecall: true }, __code: "skipped = true;" },
    );
  } else {
    const r = await runRetrieval(input.currentQuery, 3, 0.10, disableSet);
    pool = { facts: r.pool.facts, filePath: r.pool.filePath };
    excludedPool = r.excludedPool;
    topK = r.finalTop;
    thresholdRejection = r.thresholdRejection;
    logger.info(
      "│ 主流程-4步拼装",
      "│ ② 召回-完成",
      "为什么写这条日志：让页面看到本次召回跑了多少候选、Top-K 多少条、关掉了哪些类别、有没有阈值弃权。",
      {
        入参: { query: input.currentQuery, disableMemoryTypes },
        返回值: {
          candidateCount: pool.facts.length,
          excludedCount: excludedPool.facts.length,
          topKSize: topK.length,
          thresholdRejection: thresholdRejection
            ? { topScore: thresholdRejection.topScore, threshold: thresholdRejection.threshold, rejectedKey: thresholdRejection.rejectedTop.fact.key }
            : null,
        },
      },
    );
  }

  // ── ③ 工作记忆累积：messages 数组本来就在上下文窗口里 ──
  // 拼 system 段（① + ② + 模型行为约定）
  const systemContent = `你是公司内部前端代码助手。下面分三块拼成 system 段：

【程序性记忆 / 全员规则】
${programBlock}

【语义 / 情景记忆 / 召回结果】
${
  skipped
    ? "（本次跳过了召回步骤，按 toggle 不读记忆库）"
    : topK.length === 0
      ? "（事实库里没有任何一条与这个问题相关的内容）"
      : topK
          .map((s, i) => {
            return `[${i + 1}] 类型=${s.fact.memoryType} / 期限=${s.fact.term} / 余弦相似度=${s.score.toFixed(4)}
原话：${s.fact.sentence}
理由：${s.fact.reason}`;
          })
          .join("\n\n")
}

【行为约定】
- 只能从上面召回的事实里找答案；没召回到的直接说「我的长期记忆里没有这条信息」。
- 不要编造召回事实里没写的内容。
- 引用了哪几条按出现顺序简短列出。`;

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
    `为什么写这条日志：真发网络请求的那一次。整条 4 步拼装已就位（① 程序性 ${programRules.length} 条 / ② 召回 ${topK.length} 条 / ③ 工作记忆 ${historyNoSystem.length} 条 history），现在请模型基于这些事实回答「${input.currentQuery}」。`,
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
    recall: {
      pool,
      excludedPool,
      topK,
      thresholdRejection,
      skipped,
    },
    modelRequest: request,
    modelResponse: response,
    modelAnswer,
    durationMs: Date.now() - t0,
  };

  logger.info(
    "│ 主流程-4步拼装",
    "调用函数结束：runFullPipeline",
    "为什么写这条日志：让页面拿到完整 4 步拼装结果 + 完整请求/响应 + 模型回答，方便学习者核对每一步是不是按预期走。当前：即将返回给路由。",
    {
      返回值: {
        historyLength: input.messages.length,
        programRuleCount: programRules.length,
        recallSize: topK.length,
        recallSkipped: skipped,
        answerPreview: modelAnswer.slice(0, 80),
        durationMs: Date.now() - t0,
      },
      耗时ms: Date.now() - t0,
    },
  );

  return output;
}