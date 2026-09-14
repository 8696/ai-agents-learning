/**
 * 职责：评测集（变体 11）—— 跑"原句 vs 改写"两个 mode，对照命中率。
 * 数据流：对 EVAL_SET 每题按 mode 跑检索，对照期望命中 → 命中率 + 每题详情。
 * 本步核心：「一次只切一个变量」——本次只切"改写开 / 关"，其他开关不动。
 *          top-K=5（demo 检索给 5 条；top-1 太严，top-10 太宽）。
 *          targetIds 多 id 命中：top-K 含任一即算命中。
 */
import { EVAL_SET, type EvalQuestion } from "../corpus/eval-set.js";
import { logger } from "../logger.js";
import { retrieveByQuery, rewriteAndRetrieve, type RetrieveResult } from "./rewrite-and-retrieve.js";

const TOP_K = 5;

export type EvalMode = "original" | "rewritten";

export type EvalQuestionResult = {
  id: string;
  query: string;
  category: string;
  targetIds: string[];
  /** top-K 命中的 chunk id 列表（按 cosine / score 降序） */
  hitIds: string[];
  /** 期望命中 ⊆ hitIds？即这一题算命中 */
  hit: boolean;
  /** 仅 rewritten 模式可能存在：改写模型挂了 → 回退原句检索 */
  rewriterFailed?: boolean;
  rewriterReason?: string;
  /** 仅 original 模式：原句检索结果 */
  originalRetrieve: RetrieveResult;
};

export type EvalModeSummary = {
  hitCount: number;
  total: number;
  hitRate: number;
  perQuestion: EvalQuestionResult[];
};

export type EvalResult = {
  topK: number;
  modes: Record<EvalMode, EvalModeSummary>;
};

/**
 * 跑评测：对每题按指定 mode 跑检索，对照 targetIds 判定命中。
 */
export async function runEvaluate(opts: { modes: EvalMode[] }): Promise<EvalResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-runEvaluate",
    "调用函数开始：runEvaluate",
    "为什么写这条日志：评测集跑一次平均要几十秒，开头记录总题数 + mode 数。当前：即将逐题跑。",
    { 入参: { 总题数: EVAL_SET.length, modes: opts.modes } },
  );

  const result: EvalResult = { topK: TOP_K, modes: {} as Record<EvalMode, EvalModeSummary> };

  for (const mode of opts.modes) {
    const perQuestion: EvalQuestionResult[] = [];

    for (const q of EVAL_SET) {
      // 1. 按 mode 跑检索（改写模式单独 catch：改写挂了 → 原句兜底，标 rewriterFailed）
      let originalRetrieve: RetrieveResult;
      let rewriterFailed = false;
      let rewriterReason = "";
      if (mode === "original") {
        originalRetrieve = retrieveByQuery(q.query);
      } else {
        try {
          originalRetrieve = (await rewriteAndRetrieve(q.query)).retrieve;
        } catch (err) {
          // 笔记变体 13：改写挂了原句兜底
          rewriterFailed = true;
          rewriterReason = err instanceof Error ? err.message : String(err);
          originalRetrieve = retrieveByQuery(q.query);
        }
      }

      // 2. 取 top-K 命中的 id 列表
      const hitIds = originalRetrieve.ranked.slice(0, TOP_K).map((r) => r.id);

      // 3. 判定：期望命中 ⊆ hitIds 即命中（任一命中即算）
      const hit = q.targetIds.some((tid) => hitIds.includes(tid));

      perQuestion.push({
        id: q.id,
        query: q.query,
        category: q.category,
        targetIds: q.targetIds,
        hitIds,
        hit,
        originalRetrieve,
        rewriterFailed,
        rewriterReason,
      });
    }

    const hitCount = perQuestion.filter((r) => r.hit).length;
    const total = EVAL_SET.length;
    result.modes[mode] = {
      hitCount,
      total,
      hitRate: total > 0 ? hitCount / total : 0,
      perQuestion,
    };

    logger.info(
      `│ 调用函数-runEvaluate-mode-${mode}`,
      `调用函数结束：mode=${mode}`,
      `为什么写这条日志：每跑完一个 mode 立刻记命中率，方便归因是哪个 mode 提升的。当前：${mode} 命中率 ${hitCount}/${total} = ${(hitCount / total * 100).toFixed(1)}%。`,
      {
        返回值: { hitCount, total, hitRate: hitCount / total },
        耗时ms: Date.now() - t0,
      },
    );
  }

  logger.info(
    "调用函数-runEvaluate",
    "调用函数结束：runEvaluate",
    "为什么写这条日志：所有 mode 跑完，记总耗时 + 总命中率对照（一次只加一个变量原则下，原句是基线、改写是对照）。当前：评测完成。",
    {
      返回值: {
        topK: TOP_K,
        modes: Object.fromEntries(
          Object.entries(result.modes).map(([k, v]) => [k, { hitCount: v.hitCount, total: v.total, hitRate: v.hitRate }]),
        ),
      },
      耗时ms: Date.now() - t0,
      __code:
        "for (const mode of modes) {\n" +
        "  for (const q of EVAL_SET) {\n" +
        "    const retrieve = mode === 'original' ? retrieveByQuery(q.query) : (await rewriteAndRetrieve(q.query)).retrieve;\n" +
        "    const hitIds = retrieve.ranked.slice(0, topK).map(r => r.id);\n" +
        "    const hit = q.targetIds.some(tid => hitIds.includes(tid));\n" +
        "    perQuestion.push({ ...hit });\n" +
        "  }\n" +
        "  result.modes[mode] = { hitCount, total, hitRate, perQuestion };\n" +
        "}",
      字段释义: {
        "modes[mode].hitRate": "命中率 = 命中题数 / 总题数；只切'改写开 / 关'一个变量",
        "perQuestion[].hit": "top-5 命中含 targetIds 任一即 hit=true",
      },
    },
  );
  return result;
}

/** 暴露给路由 + 校验用 */
export { EVAL_SET, type EvalQuestion };