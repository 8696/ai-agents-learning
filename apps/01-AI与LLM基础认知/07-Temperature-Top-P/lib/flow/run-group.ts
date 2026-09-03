/**
 * 职责：跑「同一档参数 N 次」，并判定这一档到底稳不稳（STABLE / DIVERGED / PARTIAL / FAILED）。
 * 数据流：{ llm, prompt, params, runs, label } → N 次 callOnce（并发）→ 去重 → GroupResult。
 * 为什么单独成文件：这是本 Demo 的最小实验单元。温度扫描、Top-P 扫描、重复稳定性
 *   三个场景的差别只在于「用哪些参数调它几次」，判定口径必须完全一致才有可比性。
 */
import type { Llm } from "../../../../llm.js";
import { callOnce } from "../sampling/call-once.js";
import type {
  GroupResult,
  SamplingParams,
  SingleRun,
  Verdict,
} from "../sampling/sampling-types.js";

type RunGroupInput = {
  llm: Llm;
  prompt: string;
  params: SamplingParams;
  runs: number;
  label: string;
};

export async function runGroup(input: RunGroupInput): Promise<GroupResult> {
  const { llm, prompt, params, runs, label } = input;

  // ① allSettled 而不是 all：一次 reject 不能把整组结果丢掉。
  //    callOnce 内部已经吞了大部分异常，这里兜住的是它自己都没接住的意外。
  const settled = await Promise.allSettled(
    Array.from({ length: runs }, (_unused, i) => callOnce(llm, prompt, params, i + 1)),
  );
  const collected = collectRuns(settled);

  // ② 判定必须在收齐之后做：只看第一条会把「部分失败」误判成稳定。
  const judged = judgeRuns(collected);

  return {
    label,
    temperature: params.temperature,
    topP: params.topP,
    runs: collected,
    ...judged,
  };
}

/** 把 allSettled 的两种形态拍平成同一种 SingleRun，页面就不用认两套形状。 */
function collectRuns(settled: PromiseSettledResult<SingleRun>[]): SingleRun[] {
  return settled.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    const reason =
      result.reason instanceof Error ? result.reason.message : String(result.reason);
    return { index: i + 1, text: "", durationMs: 0, error: reason };
  });
}

/**
 * 稳定性判定。顺序不能换：
 *   先看「全挂」→ 再看「部分挂」→ 最后才谈相同 / 分叉。
 * 否则一组里只成功了一次时，distinctCount 会是 1，被误报成「完全稳定」。
 */
function judgeRuns(runs: SingleRun[]): {
  distinctTexts: string[];
  distinctCount: number;
  same: boolean | null;
  verdict: Verdict;
  verdictLabel: string;
} {
  const okRuns = runs.filter((r) => !r.error);
  const distinctTexts = Array.from(new Set(okRuns.map((r) => r.text)));
  const base = { distinctTexts, distinctCount: distinctTexts.length };

  if (okRuns.length === 0) {
    return { ...base, same: null, verdict: "FAILED", verdictLabel: "❌ 本组全部失败" };
  }
  if (okRuns.length < runs.length) {
    return {
      ...base,
      same: null,
      verdict: "PARTIAL",
      verdictLabel: "⚠️ 部分失败，稳定性判不了",
    };
  }
  // 逐字严格相等才算稳：大小写、空格、标点的差别，下游解析器一样会炸。
  if (distinctTexts.length === 1) {
    return { ...base, same: true, verdict: "STABLE", verdictLabel: "✅ 每次都一样" };
  }
  return {
    ...base,
    same: false,
    verdict: "DIVERGED",
    verdictLabel: `🔀 ${distinctTexts.length} 种说法`,
  };
}
