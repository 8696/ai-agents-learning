/**
 * 职责：评测集 + 命中率主流程。
 * 本步核心：同一份 20 条问句跑三种 pipeline → 算 hit 数 → 返命中率 + 每条详情。
 * 数据流：评测集 + pipeline 名 + K → 逐条跑 → 算命中 → 汇总。
 * 为什么单独成文件：本步核心是「批量跑 + 算命中率」，不是单条召回 / 精排。
 */
import { recallCandidates } from "./recall.js";
import { CORPUS } from "../corpus/knowledge-base.js";
import { EVAL_SET, type EvalQuery } from "../corpus/eval-set.js";
import { logger } from "../logger.js";

export type PipelineName = "recall" | "recall+pointwise" | "recall+listwise";

export type EvalRow = {
  id: number;
  query: string;
  expectedId: string;
  expectedTitle: string;
  difficulty: EvalQuery["difficulty"];
  /** 召回名次（1-based；0 = 召回窗里没有） */
  recallRank: number;
  /** 精排后名次（1-based；0 = 没有进入精排后的 Top-K） */
  finalRank: number;
  /** true = 期望 id 进了最终 Top-K */
  hit: boolean;
  /** 失败归因：召回窗里没有 vs 精排后仍没进 K vs 命中 */
  missReason: "none" | "out-of-window" | "rerank-miss";
};

export type EvalSummary = {
  pipeline: PipelineName;
  k: number;
  total: number;
  hits: number;
  hitRate: number;
  byDifficulty: {
    simple:  { total: number; hits: number; hitRate: number };
    medium:  { total: number; hits: number; hitRate: number };
    hard:    { total: number; hits: number; hitRate: number };
  };
};

export type EvalResult = {
  pipeline: PipelineName;
  k: number;
  rows: EvalRow[];
  summary: EvalSummary;
};

/**
 * mock 精排打分：本仓库不接真对话模型，避免 20 条 × N 次调用 token / 时间吃紧。
 * 教学点故意偏向特例：unopened-exception 直接 0.95，其他按粗召回分排序。
 * 这是教学简化（页面上要明说），不是生产做法。
 */
function mockRerankScores(recallRows: Array<{ chunk: { id: string }; coarseScore: number }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of recallRows) {
    if (row.chunk.id === "unopened-exception") {
      out.set(row.chunk.id, 0.95);
    } else {
      out.set(row.chunk.id, row.coarseScore / 20);
    }
  }
  return out;
}

function buildById() {
  const m = new Map<string, string>();
  for (const chunk of CORPUS) m.set(chunk.id, chunk.title);
  return m;
}

const TITLE_BY_ID = buildById();

export function runEval(pipeline: PipelineName, k: number): EvalResult {
  const t0 = Date.now();
  const rows: EvalRow[] = [];

  logger.info(
    "调用函数-runEval",
    "调用函数开始：runEval",
    "为什么写这条日志：本步是评测集 + 命中率主流程。同一份 20 条问句跑三种 pipeline。当前：开始逐条跑。",
    {
      入参: { pipeline, k },
      __code: "逐条跑 pipeline(pipeline, k) → 算 recallRank + finalRank → 判 hit + missReason",
    },
  );

  for (const item of EVAL_SET) {
    const recall = recallCandidates(item.query, 6);
    const expectedId = item.expectedId;
    const expectedRow = recall.rows.find((row) => row.chunk.id === expectedId);
    const recallRank = expectedRow ? expectedRow.recallRank : 0;

    let finalRank = 0;
    if (pipeline === "recall") {
      finalRank = recallRank;
    } else if (pipeline === "recall+pointwise") {
      const scores = mockRerankScores(recall.rows);
      const sorted = recall.rows
        .map((row) => ({ id: row.chunk.id, score: scores.get(row.chunk.id) ?? 0, recallRank: row.recallRank }))
        .sort((a, b) => b.score - a.score || a.recallRank - b.recallRank);
      const idx = sorted.findIndex((s) => s.id === expectedId);
      finalRank = idx >= 0 ? idx + 1 : 0;
    } else if (pipeline === "recall+listwise") {
      // Listwise mock：直接按粗召回分降序（教学简化：和 Pointwise mock 行为相近但形态是 orderedIds）
      const sorted = [...recall.rows]
        .map((row) => ({ id: row.chunk.id, recallRank: row.recallRank }))
        .sort((a, b) => b.recallRank - a.recallRank); // recallRank 升序 = 召回分降序
      const idx = sorted.findIndex((s) => s.id === expectedId);
      finalRank = idx >= 0 ? idx + 1 : 0;
    }

    const hit = finalRank > 0 && finalRank <= k;
    let missReason: EvalRow["missReason"] = "none";
    if (!hit) {
      missReason = recallRank === 0 ? "out-of-window" : "rerank-miss";
    }

    rows.push({
      id: item.id,
      query: item.query,
      expectedId,
      expectedTitle: TITLE_BY_ID.get(expectedId) ?? expectedId,
      difficulty: item.difficulty,
      recallRank,
      finalRank,
      hit,
      missReason,
    });
  }

  const byDifficulty: EvalSummary["byDifficulty"] = {
    simple:  { total: 0, hits: 0, hitRate: 0 },
    medium:  { total: 0, hits: 0, hitRate: 0 },
    hard:    { total: 0, hits: 0, hitRate: 0 },
  };
  let totalHits = 0;
  for (const row of rows) {
    if (row.hit) totalHits += 1;
    const bucket = byDifficulty[row.difficulty];
    bucket.total += 1;
    if (row.hit) bucket.hits += 1;
  }
  for (const key of ["simple", "medium", "hard"] as const) {
    const b = byDifficulty[key];
    b.hitRate = b.total > 0 ? b.hits / b.total : 0;
  }

  const summary: EvalSummary = {
    pipeline,
    k,
    total: rows.length,
    hits: totalHits,
    hitRate: rows.length > 0 ? totalHits / rows.length : 0,
    byDifficulty,
  };

  const result: EvalResult = {
    pipeline,
    k,
    rows,
    summary,
  };

  logger.info(
    "调用函数-runEval",
    "调用函数结束：runEval",
    "为什么写这条日志：20 条全部跑完。三档难度各自命中率算清。当前：可观察对照 = hit rate。",
    { 返回值: { pipeline, k, summary }, 耗时ms: Date.now() - t0 },
  );
  return result;
}
