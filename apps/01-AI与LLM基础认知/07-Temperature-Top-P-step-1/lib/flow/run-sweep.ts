/**
 * 职责：扫一条参数梯子 —— 固定一个旋钮，把另一个旋钮的三档并排跑出来。
 * 数据流：{ llm, prompt, runs, 轴 } → 三档 × N 次 runGroup（三档并发）→ SweepResponse。
 * 为什么单独成文件：温度扫描与 Top-P 扫描是同一套流程的两个轴，
 *   共用 runLadder 才能保证「两页看到的判定口径、耗时统计完全一致」；
 *   同层的两个入口函数放同一文件，比拆成两个各十行的文件更好读。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import {
  FIXED_TOP_P,
  TEMPERATURE_LADDER,
  TOP_P_LADDER,
} from "../sampling/presets.js";
import type {
  GroupResult,
  SweepAxis,
  SweepResponse,
} from "../sampling/sampling-types.js";
import { runGroup } from "./run-group.js";

type SweepInput = {
  llm: Llm;
  prompt: string;
  runs: number;
};

/** 扫温度：Top-P 固定为 1（不过滤候选），这样看到的差异只可能来自温度。 */
export async function runTemperatureSweep(input: SweepInput): Promise<SweepResponse> {
  return runLadder({
    ...input,
    axis: "temperature",
    ladder: TEMPERATURE_LADDER,
    fixedValue: FIXED_TOP_P,
  });
}

/**
 * 扫 Top-P：温度由调用方给（页面上可选 1 或 0）。
 * 选 0 时三档应当输出完全一致 —— 贪心解码下候选集大小不起作用，这是本页要验证的反例。
 */
export async function runTopPSweep(
  input: SweepInput & { temperature: number },
): Promise<SweepResponse> {
  return runLadder({
    llm: input.llm,
    prompt: input.prompt,
    runs: input.runs,
    axis: "top_p",
    ladder: TOP_P_LADDER,
    fixedValue: input.temperature,
  });
}

type LadderInput = SweepInput & {
  axis: SweepAxis;
  ladder: readonly number[];
  /** 被固定住的那个旋钮的取值：扫温度时是 top_p，扫 top_p 时是 temperature */
  fixedValue: number;
};

async function runLadder(input: LadderInput): Promise<SweepResponse> {
  const { llm, prompt, runs, axis, ladder, fixedValue } = input;
  const startedAt = performance.now();

  // ① 三档并发：串行跑的话总耗时是三倍，读者会以为「高温度更慢」——那是假象。
  const groups: GroupResult[] = await Promise.all(
    ladder.map((value) =>
      runGroup({
        llm,
        prompt,
        runs,
        params: buildParams(axis, value, fixedValue),
        label: axis === "temperature" ? `T = ${value}` : `top_p = ${value}`,
      }),
    ),
  );

  return {
    axis,
    // ② 固定旋钮必须回给页面：不显示它，读者会以为两个参数都在动，归因就错了。
    fixed: { param: axis === "temperature" ? "top_p" : "temperature", value: fixedValue },
    prompt,
    provider: llm.provider,
    model: llm.modelA,
    runsPerGroup: runs,
    groups,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

function buildParams(axis: SweepAxis, value: number, fixedValue: number) {
  return axis === "temperature"
    ? { temperature: value, topP: fixedValue }
    : { temperature: fixedValue, topP: value };
}
