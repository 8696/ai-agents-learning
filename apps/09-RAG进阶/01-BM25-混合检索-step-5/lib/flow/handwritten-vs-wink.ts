/**
 * 本步核心：同一库、同一问句、同一套切词 —— 手写 BM25 vs wink-bm25-text-search，
 *           并对内置判定用例自动打「过 / 不过」。
 *
 * 职责：
 *   - compareOnce：两侧各出 Top-K + 是否 Top-1 一致
 *   - judgeCase / judgeAll：按 JUDGE_CASES 规则判手写侧、库侧、两侧是否一致
 *
 * 数据流：caseId 或 question → 手写 bm25Score + wink search → 拼对照 + 判定
 *
 * 主流程单独成文件（§5.3.8）：打开本文件就能读完对照路径。
 */
import { CORPUS } from "../corpus/knowledge-base.js";
import { bm25Score } from "../corpus/bm25.js";
import { searchByWink } from "../corpus/wink-bm25.js";
import { JUDGE_CASES, type JudgeCase } from "../corpus/judge-cases.js";
import { withCall } from "../http/with-call.js";
import { HttpError } from "../http/send-error.js";

export type RankRow = {
  cardId: string;
  text: string;
  score: number;
  rank: number;
  matchedTerms?: string[];
};

export type SideResult = {
  label: "handwritten" | "wink";
  displayName: string;
  /** 仅手写侧：自己 tokenize 出来的；wink.search 不返回切词，库侧不填 */
  tokens?: string[];
  rows: RankRow[];
  top1: string | null;
};

export type CompareResult = {
  query: string;
  topK: number;
  handwritten: SideResult;
  wink: SideResult;
  /** 两侧 Top-1 的 cardId 是否相同（分数可以不同） */
  top1Agree: boolean;
};

export type SideVerdict = {
  passed: boolean;
  top1: string | null;
  reason: string;
};

export type JudgeResult = {
  case: JudgeCase;
  compare: CompareResult;
  handwritten: SideVerdict;
  wink: SideVerdict;
  /** 两条通道结论一致且都过规则 */
  bothPassed: boolean;
  agree: boolean;
};

function top1Of(rows: RankRow[]): string | null {
  return rows[0]?.cardId ?? null;
}

function verdictFor(rule: JudgeCase["rule"], expectTop1: string | null, rows: RankRow[]): SideVerdict {
  const top1 = top1Of(rows);
  if (rule === "top1-equals") {
    const passed = top1 === expectTop1;
    return {
      passed,
      top1,
      reason: passed
        ? `Top-1 = ${top1}，符合期望`
        : `期望 Top-1 = ${expectTop1}，实际 = ${top1 ?? "（空）"}`,
    };
  }
  // top1-miss：不该把 expectTop1 打成第 1（名单空或 Top-1 是别的卡都算过）
  const passed = top1 !== expectTop1;
  return {
    passed,
    top1,
    reason: passed
      ? `Top-1 = ${top1 ?? "（空）"}，没有误把 ${expectTop1} 打成第 1`
      : `不该把 ${expectTop1} 打成 Top-1，但打成了（多半是偶发共同词）`,
  };
}

/** 两侧各跑一次，返回对照（不含判定） */
export async function compareOnce(query: string, topK = 5): Promise<CompareResult> {
  const handwrittenRaw = await withCall({
    scope: "│ 调用函数-bm25Score",
    kind: "函数",
    name: "bm25Score（手写）",
    explain: "为什么写这条日志：手写教学版 BM25，对照库侧用。当前：本地对 CORPUS 打分。",
    args: { query, topK, cards: CORPUS.map((c) => c.id) },
    code: "const out = bm25Score(query, CORPUS);",
    run: async () => bm25Score(query, CORPUS),
  });

  const winkRaw = await withCall({
    scope: "│ 调用函数-searchByWink",
    kind: "函数",
    name: "searchByWink（wink-bm25-text-search）",
    explain: "为什么写这条日志：成熟库侧搜索；建索引时用 definePrepTasks 注入同一套 keep-dash，但 search 只回 id+分数。当前：内存索引已 consolidate。",
    args: { query, topK },
    code: "const out = searchByWink(query, topK);",
    run: async () => searchByWink(query, topK),
  });

  const handwrittenRows: RankRow[] = handwrittenRaw.rows.slice(0, topK).map((r) => ({
    cardId: r.card.id,
    text: r.card.text,
    score: r.score,
    rank: r.rank,
    matchedTerms: r.matchedTerms,
  }));
  const winkRows: RankRow[] = winkRaw.rows.map((r) => ({
    cardId: r.cardId,
    text: r.text,
    score: r.score,
    rank: r.rank,
  }));

  const handwritten: SideResult = {
    label: "handwritten",
    displayName: "手写 BM25（本仓库 lib/corpus/bm25.ts）",
    tokens: handwrittenRaw.tokens,
    rows: handwrittenRows,
    top1: top1Of(handwrittenRows),
  };
  const wink: SideResult = {
    label: "wink",
    displayName: "成熟库 wink-bm25-text-search",
    // 不填 tokens：库 search 只回 [id, score]，页面不展示我们自己补的切词
    rows: winkRows,
    top1: top1Of(winkRows),
  };

  return {
    query,
    topK,
    handwritten,
    wink,
    top1Agree: handwritten.top1 !== null && handwritten.top1 === wink.top1,
  };
}

export async function judgeCase(caseId: string, topK = 5): Promise<JudgeResult> {
  const judgeCaseDef = JUDGE_CASES.find((c) => c.id === caseId);
  if (!judgeCaseDef) {
    throw new HttpError(400, `未知用例 id：${caseId}`, "对照 GET /api/judge-cases 的 id 列表");
  }
  const compare = await compareOnce(judgeCaseDef.question, topK);
  const handwritten = verdictFor(judgeCaseDef.rule, judgeCaseDef.expectTop1, compare.handwritten.rows);
  const wink = verdictFor(judgeCaseDef.rule, judgeCaseDef.expectTop1, compare.wink.rows);
  return {
    case: judgeCaseDef,
    compare,
    handwritten,
    wink,
    bothPassed: handwritten.passed && wink.passed,
    agree: compare.top1Agree,
  };
}

export async function judgeAll(topK = 5): Promise<{
  summary: { total: number; bothPassed: number; handwrittenPassed: number; winkPassed: number };
  results: JudgeResult[];
}> {
  const results: JudgeResult[] = [];
  for (const c of JUDGE_CASES) {
    results.push(await judgeCase(c.id, topK));
  }
  return {
    summary: {
      total: results.length,
      bothPassed: results.filter((r) => r.bothPassed).length,
      handwrittenPassed: results.filter((r) => r.handwritten.passed).length,
      winkPassed: results.filter((r) => r.wink.passed).length,
    },
    results,
  };
}

export function listJudgeCases(): JudgeCase[] {
  return JUDGE_CASES;
}
