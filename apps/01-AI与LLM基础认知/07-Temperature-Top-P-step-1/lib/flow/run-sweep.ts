/**
 * 职责：扫一条参数梯子 —— 固定一个旋钮，把另一个旋钮的三档并排跑出来。
 * 数据流：{ llm, prompt, runs, 轴 } → 三档 × N 次 runGroup（三档并发）→ SweepResponse。
 * 为什么单独成文件：温度扫描与 Top-P 扫描是同一套流程的两个轴，
 *   共用 runLadder 才能保证「两页看到的判定口径、耗时统计完全一致」；
 *   同层的两个入口函数放同一文件，比拆成两个各十行的文件更好读。
 *
 * 日志（§5.3.16）：调用函数 五条日志（runLadder / runTemperatureSweep / runTopPSweep 封装层）；
 *   三档并发跑属于外层循环——按 §5.3.16 循环规则，每一圈打「调用循环开始 / 结束」；
 *   子调用 runGroup 内部已自带五条日志（scope 多一根 `│`）。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import { logger } from "../logger.js";
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
  const tStart = Date.now();
  logger.info(
    "│ 扫描-runTemperatureSweep",
    "调用函数开始：runTemperatureSweep",
    "为什么写这条日志：route 只认这一层返回的 SweepResponse；里面 runLadder 是真正干活的那一层。当前：扫温度即将开始；Top-P 固定为 1（不过滤候选）。",
    {
      入参: { ...input, fixedTopP: FIXED_TOP_P, ladderLen: TEMPERATURE_LADDER.length },
      __code: `return runLadder({ ...input, axis: "temperature", ladder: TEMPERATURE_LADDER, fixedValue: FIXED_TOP_P });`,
    },
  );
  const result = await runLadder({
    ...input,
    axis: "temperature",
    ladder: TEMPERATURE_LADDER,
    fixedValue: FIXED_TOP_P,
  });
  logger.info(
    "│ 扫描-runTemperatureSweep",
    "调用函数结束：runTemperatureSweep",
    "为什么写这条日志：route 要把 SweepResponse 写进 ctx.body 交给页面；打 verdict 三档便于一眼核对温度效果。当前：runLadder 已返回。",
    {
      返回值: {
        axis: result.axis,
        groupsCount: result.groups.length,
        verdicts: result.groups.map((g) => ({ label: g.label, verdict: g.verdict })),
      },
      耗时ms: Date.now() - tStart,
    },
  );
  return result;
}

/**
 * 扫 Top-P：温度由调用方给（页面上可选 1 或 0）。
 * 选 0 时三档应当输出完全一致 —— 贪心解码下候选集大小不起作用，这是本页要验证的反例。
 */
export async function runTopPSweep(
  input: SweepInput & { temperature: number },
): Promise<SweepResponse> {
  const tStart = Date.now();
  logger.info(
    "│ 扫描-runTopPSweep",
    "调用函数开始：runTopPSweep",
    "为什么写这条日志：route 只认这一层返回的 SweepResponse；里面 runLadder 是真正干活的那一层。当前：扫 Top-P 即将开始；温度由调用方给（默认 1；选 0 验证贪心解码下 Top-P 不起作用）。",
    {
      入参: { ...input, ladderLen: TOP_P_LADDER.length },
      __code: `return runLadder({ llm: input.llm, prompt: input.prompt, runs: input.runs, axis: "top_p", ladder: TOP_P_LADDER, fixedValue: input.temperature });`,
    },
  );
  const result = await runLadder({
    llm: input.llm,
    prompt: input.prompt,
    runs: input.runs,
    axis: "top_p",
    ladder: TOP_P_LADDER,
    fixedValue: input.temperature,
  });
  logger.info(
    "│ 扫描-runTopPSweep",
    "调用函数结束：runTopPSweep",
    "为什么写这条日志：route 要把 SweepResponse 写进 ctx.body 交给页面；打 verdict 三档便于一眼核对 Top-P 效果（temperature=0 时三档应当一致）。当前：runLadder 已返回。",
    {
      返回值: {
        axis: result.axis,
        groupsCount: result.groups.length,
        verdicts: result.groups.map((g) => ({ label: g.label, verdict: g.verdict })),
      },
      耗时ms: Date.now() - tStart,
    },
  );
  return result;
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
  const tFuncStart = Date.now();

  logger.info(
    "│ 梯子-runLadder",
    "调用函数开始：runLadder",
    "为什么写这条日志：扫描页与重复页都共用这一层；不写就丢了「三档 × N 次」的整体耗时统计。当前：三档即将并发。",
    {
      入参: { axis, fixedValue, ladder, runsPerGroup: runs },
      __code: `const groups = await Promise.all(ladder.map(value => runGroup({ llm, prompt, runs, params: buildParams(axis, value, fixedValue), label: ... })));`,
    },
  );

  // ① 三档并发：串行跑的话总耗时是三倍，读者会以为「高温度更慢」——那是假象。
  const groups: GroupResult[] = await Promise.all(
    ladder.map((value, i) => {
      const round = i + 1;
      const tRoundStart = Date.now();
      logger.info(
        "││ 调用循环-runLadder",
        `调用循环开始：第 ${round} 轮 / 共 ${ladder.length} 轮`,
        "为什么写这条日志：梯子上每档要写满循环五条日志，便于核对「三档确实是并发跑的、不是串行」。当前：第 N 档即将 runGroup。",
        {
          第几轮: round,
          本轮为什么是这些参数: {
            axis,
            value,
            fixedValue,
            label: axis === "temperature" ? `T = ${value}` : `top_p = ${value}`,
            reason: "梯子上每档对应一个旋钮值；另一旋钮由 fixedValue 固定住。",
          },
        },
      );
      return runGroup({
        llm,
        prompt,
        runs,
        params: buildParams(axis, value, fixedValue),
        label: axis === "temperature" ? `T = ${value}` : `top_p = ${value}`,
      }).then((group) => {
        logger.info(
          "││ 调用循环-runLadder",
          `调用循环结束：第 ${round} 轮`,
          "为什么写这条日志：每一档的 verdict 是页面上并排三张卡片的判稳依据。当前：runGroup 已返回。",
          {
            第几轮: round,
            本轮结果: { label: group.label, verdict: group.verdict, distinctCount: group.distinctCount },
            耗时ms: Date.now() - tRoundStart,
          },
        );
        return group;
      });
    }),
  );

  const response: SweepResponse = {
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

  logger.info(
    "│ 梯子-runLadder",
    "调用函数结束：runLadder",
    "为什么写这条日志：上层的 runTemperatureSweep / runTopPSweep 要把 SweepResponse 写进 ctx.body；打三档 verdict 一目了然。当前：梯子跑完，durationMs 已算。",
    {
      返回值: {
        axis: response.axis,
        fixed: response.fixed,
        groupsCount: response.groups.length,
        totalDurationMs: response.durationMs,
      },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  return response;
}

function buildParams(axis: SweepAxis, value: number, fixedValue: number) {
  return axis === "temperature"
    ? { temperature: value, topP: fixedValue }
    : { temperature: fixedValue, topP: value };
}