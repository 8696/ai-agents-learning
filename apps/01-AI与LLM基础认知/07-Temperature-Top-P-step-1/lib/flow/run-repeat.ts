/**
 * 职责：固定一组参数连跑 N 次，回答「这一档到底有多稳」。
 * 数据流：{ llm, prompt, params, runs } → 一次 runGroup（N 次并发）→ RepeatResponse。
 * 为什么单独成文件：扫描页问的是「换参数会怎样」，本页问的是「同一组参数重复会怎样」——
 *   两个问题的响应形状不同（一张卡片 vs 三张），混在 run-sweep 里会逼出一堆可选字段。
 *
 * 日志（§5.3.16）：调用函数 五条日志（runRepeat 封装层）；
 *   子调用 runGroup 内部已自带五条日志。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import { logger } from "../logger.js";
import type { RepeatResponse, SamplingParams } from "../sampling/sampling-types.js";
import { runGroup } from "./run-group.js";

type RepeatInput = {
  llm: Llm;
  prompt: string;
  params: SamplingParams;
  runs: number;
};

export async function runRepeat(input: RepeatInput): Promise<RepeatResponse> {
  const { llm, prompt, params, runs } = input;
  const startedAt = performance.now();
  const tFuncStart = Date.now();

  logger.info(
    "│ 重复-runRepeat",
    "调用函数开始：runRepeat",
    "为什么写这条日志：route 只认这一层返回的 RepeatResponse；里面 runGroup 是真正干活的那一层（一次跑 N 次）。当前：即将复用 runGroup。",
    {
      入参: { temperature: params.temperature, topP: params.topP, runs, promptLen: prompt.length },
      __code: `const group = await runGroup({ llm, prompt, params, runs, label: "T = ${params.temperature} · top_p = ${params.topP}" });`,
    },
  );

  // ① 复用 runGroup：判定口径（逐字相等、部分失败怎么算）必须和扫描页一致，
  //    否则同一档参数在两页会得出不同结论。
  const group = await runGroup({
    llm,
    prompt,
    params,
    runs,
    label: `T = ${params.temperature} · top_p = ${params.topP}`,
  });

  const response: RepeatResponse = {
    prompt,
    provider: llm.provider,
    model: llm.modelA,
    runs,
    params,
    group,
    durationMs: Math.round(performance.now() - startedAt),
  };

  logger.info(
    "│ 重复-runRepeat",
    "调用函数结束：runRepeat",
    "为什么写这条日志：route 要把 RepeatResponse 写进 ctx.body 交给页面；打 verdict + distinctCount 一目了然。当前：runGroup 已返回。",
    {
      返回值: {
        verdict: group.verdict,
        verdictLabel: group.verdictLabel,
        distinctCount: group.distinctCount,
        durationMs: response.durationMs,
      },
      耗时ms: Date.now() - tFuncStart,
    },
  );
  return response;
}