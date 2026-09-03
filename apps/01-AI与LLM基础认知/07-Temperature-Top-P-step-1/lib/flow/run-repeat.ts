/**
 * 职责：固定一组参数连跑 N 次，回答「这一档到底有多稳」。
 * 数据流：{ llm, prompt, params, runs } → 一次 runGroup（N 次并发）→ RepeatResponse。
 * 为什么单独成文件：扫描页问的是「换参数会怎样」，本页问的是「同一组参数重复会怎样」——
 *   两个问题的响应形状不同（一张卡片 vs 三张），混在 run-sweep 里会逼出一堆可选字段。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
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

  // ① 复用 runGroup：判定口径（逐字相等、部分失败怎么算）必须和扫描页一致，
  //    否则同一档参数在两页会得出不同结论。
  const group = await runGroup({
    llm,
    prompt,
    params,
    runs,
    label: `T = ${params.temperature} · top_p = ${params.topP}`,
  });

  return {
    prompt,
    provider: llm.provider,
    model: llm.modelA,
    runs,
    params,
    group,
    durationMs: Math.round(performance.now() - startedAt),
  };
}
