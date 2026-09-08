/**
 * 职责：跑「同一档参数 N 次」，并判定这一档到底稳不稳（STABLE / DIVERGED / PARTIAL / FAILED）。
 * 数据流：{ llm, prompt, params, runs, label } → N 次 callOnce（并发）→ 去重 → GroupResult。
 * 为什么单独成文件：这是本 Demo 的最小实验单元。温度扫描、Top-P 扫描、重复稳定性
 *   三个场景的差别只在于「用哪些参数调它几次」，判定口径必须完全一致才有可比性。
 *
 * 日志（§5.3.16）：调用函数 五件套（runGroup 封装层）；
 *   N 次 callOnce 并发属于循环——按 §5.3.16 循环规则，每一圈打「调用循环开始 / 结束」；
 *   子调用 callOnce 内部已自带五件套（scope 多一根 `│`）。
 */
import type { Llm } from "../../../../llm.js";
import { logger } from "../logger.js";
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
  const tFuncStart = Date.now();
  logger.info(
    "│ 一组-runGroup",
    "调用函数开始：runGroup",
    "为什么打：本 Demo 的最小实验单元；扫描页 + 重复页都共用这一层；不打就丢了「这一档 N 次跑完的整体判定」。当前：即将并发 N 次 callOnce。",
    {
      入参: { label, temperature: params.temperature, topP: params.topP, runs, promptLen: prompt.length },
      __code: `const settled = await Promise.allSettled(Array.from({ length: runs }, (_, i) => callOnce(llm, prompt, params, i + 1)));`,
    },
  );

  // ① allSettled 而不是 all：一次 reject 不能把整组结果丢掉。
  //    callOnce 内部已经吞了大部分异常，这里兜住的是它自己都没接住的意外。
  const settled = await Promise.allSettled(
    Array.from({ length: runs }, (_unused, i) => {
      const round = i + 1;
      const tRoundStart = Date.now();
      logger.info(
        "││ 调用循环-runGroup",
        `调用循环开始：第 ${round} 轮 / 共 ${runs} 轮`,
        "为什么打：本组并发跑 N 次（每次打满循环五件套）；事后要从日志把「这一档 N 次里哪几次挂、哪几次正常」数得清。当前：第 N 轮即将 callOnce。",
        {
          第几轮: round,
          本轮为什么是这些参数: {
            temperature: params.temperature,
            topP: params.topP,
            reason: "组内所有轮都跑同一档参数，唯一变量是模型随机性。",
          },
        },
      );
      // 这里打 wrap-after 让结束日志能拿到结果；callOnce 本身已自带五件套
      return callOnce(llm, prompt, params, round).then((result) => {
        logger.info(
          "││ 调用循环-runGroup",
          `调用循环结束：第 ${round} 轮`,
          "为什么打：每一圈的结果是 judgeRuns 的输入，必须按轮收齐便于事后核对。当前：callOnce 已返回。",
          {
            第几轮: round,
            本轮结果: { index: result.index, textPreview: result.text.slice(0, 60), error: result.error ?? null },
            耗时ms: Date.now() - tRoundStart,
          },
        );
        return result;
      });
    }),
  );

  const collected = collectRuns(settled);

  // ② 判定必须在收齐之后做：只看第一条会把「部分失败」误判成稳定。
  const judged = judgeRuns(collected);

  const group: GroupResult = {
    label,
    temperature: params.temperature,
    topP: params.topP,
    runs: collected,
    ...judged,
  };

  logger.info(
    "│ 一组-runGroup",
    "调用函数结束：runGroup",
    "为什么打：上层（runRepeat / runLadder）要把 GroupResult 写进 ctx.body 交给页面；不打就丢了 verdict 标签和 distinct 数。当前：判定已完成。",
    {
      返回值: {
        label: group.label,
        verdict: group.verdict,
        verdictLabel: group.verdictLabel,
        distinctCount: group.distinctCount,
        okCount: collected.filter((r) => !r.error).length,
        failedCount: collected.filter((r) => r.error).length,
      },
      耗时ms: Date.now() - tFuncStart,
      字段释义: {
        verdict: "STABLE / DIVERGED / PARTIAL / FAILED 是这一档的稳定性结论",
      },
    },
  );
  return group;
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