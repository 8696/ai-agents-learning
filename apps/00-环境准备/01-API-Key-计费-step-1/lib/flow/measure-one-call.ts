/**
 * 职责：跑一次非流式对话，并把「这次花了多少 Token / 多少钱」量出来。
 * 数据流：{ llm, prompt, maxTokens } → openai.chat.completions.create（stream:false）
 *   → usage 三字段 → computeCost → BillingMeasurement。
 * 为什么单独成文件：单次计费和对照计费都要走这一圈，唯一区别只是调几次、用什么 prompt。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import { computeCost } from "../billing/pricing.js";
import { MissingUsageError } from "./measure-types.js";
import type { BillingMeasurement, UsageTriple } from "./measure-types.js";

export type MeasureInput = {
  llm: Llm;
  /** 并排对照时显示在卡片标题上 */
  label: string;
  prompt: string;
  maxTokens: number;
};

/**
 * 归一化 usage。
 * ① 必须 stream:false 才稳定拿得到 usage —— 流式响应的 usage 在最后一帧，甚至有的网关不回，
 *    这也是本条 Demo 不做流式的原因；
 * ② 缺 usage 直接抛：宁可 502 说清楚，也不要在页面上显示一个编出来的 Token 数。
 */
function normalizeUsage(usage: UsageTriple | undefined | null): UsageTriple {
  if (!usage) throw new MissingUsageError();
  return {
    prompt_tokens: usage.prompt_tokens ?? 0,
    completion_tokens: usage.completion_tokens ?? 0,
    total_tokens: usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
  };
}

/**
 * 量一次调用。
 * ① 计时从发请求前开始：耗时和 Token 数是两回事，页面上要能同时看到（贵 ≠ 慢）；
 * ② max_tokens 是输出侧的闸门：撞上它 finish_reason 会变成 length，
 *    这时 completion_tokens 就等于上限，说明「输出费用是可以被自己限住的」；
 * ③ 折价放在这里而不是 route：route 只负责写 HTTP，换单价不该动 route。
 */
export async function measureOneCall(input: MeasureInput): Promise<BillingMeasurement> {
  const { llm, label, prompt, maxTokens } = input;
  const startedAt = performance.now();

  const completion = await llm.openai.chat.completions.create({
    model: llm.modelA,
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
    stream: false,
  });

  const usage = normalizeUsage(completion.usage);
  const choice = completion.choices[0];

  return {
    label,
    prompt,
    maxTokens,
    model: llm.modelA,
    reply: choice?.message.content ?? "",
    finishReason: choice?.finish_reason ?? null,
    usage,
    cost: computeCost(usage.prompt_tokens, usage.completion_tokens),
    durationMs: Math.round(performance.now() - startedAt),
  };
}

/** 服务端日志：跑完在终端也能核对一遍，页面和终端两处数字必须一致。 */
export function logMeasurement(scope: string, m: BillingMeasurement): void {
  console.log(
    `[${scope}] ${m.label} | prompt=${m.usage.prompt_tokens} completion=${m.usage.completion_tokens} ` +
      `total=${m.usage.total_tokens} | ${m.cost.totalCny} ${m.cost.currency} | ${m.durationMs}ms | finish=${m.finishReason}`,
  );
}
