/**
 * 职责：跑一次非流式对话，并把「这次花了多少 Token / 多少钱」量出来。
 * 数据流：{ llm, prompt, maxTokens } → openai.chat.completions.create（stream:false）
 *   → usage 三字段 → computeCost → BillingMeasurement。
 * 为什么单独成文件：单次计费和对照计费都要走这一圈，唯一区别只是调几次、用什么 prompt。
 *
 * 日志（§5.3.16）：调用函数 五条日志（measureOneCall 封装层）；调用模型 五条日志（真正发网络请求的那一层，含 __code + 字段释义）。
 *   logMeasurement 算「普通函数」（helper），五条日志（含 __code）仍要。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import { computeCost } from "../billing/pricing.js";
import { MissingUsageError } from "./measure-types.js";
import type { BillingMeasurement, UsageTriple } from "./measure-types.js";
import { logger } from "../logger.js";

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
 * ② max_tokens 是输出侧的校验：撞上它 finish_reason 会变成 length，
 *    这时 completion_tokens 就等于上限，说明「输出费用是可以被自己限住的」；
 * ③ 折价放在这里而不是 route：route 只负责写 HTTP，换单价不该动 route。
 */
export async function measureOneCall(input: MeasureInput): Promise<BillingMeasurement> {
  const { llm, label, prompt, maxTokens } = input;
  const startedAt = performance.now();

  const tFuncStart = Date.now();
  logger.info(
    "│ 计量一次-measureOneCall",
    "调用函数开始：measureOneCall",
    "为什么写这条日志：route 只认这一层返回的 BillingMeasurement；里面那次才是真发网络请求（看「调用模型开始：对话补全」）。当前：即将用 stream:false 创请求体。",
    {
      入参: {
        label,
        llmProvider: llm.provider,
        llmModelA: llm.modelA,
        promptPreview: prompt.slice(0, 50),
        promptLen: prompt.length,
        maxTokens,
      },
      __code: `const m = await measureOneCall({ llm, label, prompt, maxTokens });`,
    },
  );

  const requestBody = {
    model: llm.modelA,
    messages: [{ role: "user" as const, content: prompt }],
    max_tokens: maxTokens,
    stream: false as const,
  };

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么写这条日志：真正发网络请求的那一次；不写就没有 usage 三字段、也就没有账单。当前：在 measureOneCall 里即将发出 stream:false 请求；这是本条 Demo 唯一一次模型调用。",
    {
      入参: requestBody,
      __code: `const completion = await llm.openai.chat.completions.create(requestBody);`,
    },
  );

  let completion;
  try {
    completion = await llm.openai.chat.completions.create(requestBody);
    logger.info(
      "││ 调用模型-对话补全",
      "调用模型结束：对话补全",
      "为什么写这条日志：要拿到 usage 三字段算账单。当前：await 已返回，下一步归一化 usage、读 choices[0]、折价。",
      {
        返回值: {
          id: completion.id,
          model: completion.model,
          choicesCount: completion.choices.length,
          usage: completion.usage,
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          "usage.prompt_tokens": "输入侧 Token 数（账单输入栏）",
          "usage.completion_tokens": "输出侧 Token 数（账单输出栏，单价更高）",
          "usage.total_tokens": "二者之和（多数网关页面只显这个）",
        },
      },
    );
  } catch (error: unknown) {
    logger.error(
      "││ 调用模型-对话补全",
      "调用模型结束：对话补全（失败）",
      "为什么写这条日志：要让 route 区分 401/403（Key）、429（限流）、5xx（对方挂了），把 err 对象原样塞进返回值便于上层 writeMeasurementError 取 status。当前：create 抛错，路由 catch 会写统一错误响应。",
      {
        返回值: {
          message: error instanceof Error ? error.message : String(error),
          upstreamStatus: (error as { status?: number }).status,
        },
        耗时ms: Date.now() - tModelStart,
        错误: error,
      },
    );
    throw error;
  }

  const usage = normalizeUsage(completion.usage);
  const choice = completion.choices[0];
  const measurement: BillingMeasurement = {
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

  logger.info(
    "│ 计量一次-measureOneCall",
    "调用函数结束：measureOneCall",
    "为什么写这条日志：route 要把 BillingMeasurement 写进 ctx.body 交给页面 stats 区，和「计量摘要-logMeasurement」互为对照。当前：usage 已归一化、cost 已算完。",
    {
      返回值: {
        label: measurement.label,
        usage: measurement.usage,
        cost: measurement.cost,
        finishReason: measurement.finishReason,
        durationMs: measurement.durationMs,
      },
      耗时ms: Date.now() - tFuncStart,
    },
  );

  return measurement;
}

/** 服务端日志：跑完在终端也能核对一遍，页面和终端两处数字必须一致。 */
export function logMeasurement(scope: string, m: BillingMeasurement): void {
  // 普通函数（§5.3.16）：五条日志（含 __code）仍要；函数体一句带过。
  const t0 = Date.now();
  logger.info(
    `││ 计量摘要-logMeasurement[${scope}]`,
    "调用函数开始：logMeasurement",
    "为什么写这条日志：measureOneCall 之后立刻打一份摘要，便于页面 stats 区和终端同时核对账单；不查 usage 就不知道本次花了多少钱。当前：第 N 次计量刚返回。",
    {
      入参: { scope, label: m.label, totalTokens: m.usage.total_tokens, costCny: m.cost.totalCny },
      __code: `logMeasurement("/api/billing-compare", m);`,
    },
  );
  logger.info(
    `││ 计量摘要-logMeasurement[${scope}]`,
    "调用函数结束：logMeasurement",
    "为什么写这条日志：路由要在终端打一行让开发者不读日志也能看到摘要；这里把摘要写进日志便于事后查。当前：摘要已落到文件 + console。",
    {
      返回值: {
        label: m.label,
        prompt_tokens: m.usage.prompt_tokens,
        completion_tokens: m.usage.completion_tokens,
        total_tokens: m.usage.total_tokens,
        cost_cny: m.cost.totalCny,
        currency: m.cost.currency,
        duration_ms: m.durationMs,
        finish_reason: m.finishReason,
      },
      耗时ms: Date.now() - t0,
    },
  );
  // 保留终端输出，让开发者不读日志也能看到摘要
  // eslint-disable-next-line no-console
  console.log(
    `[${scope}] ${m.label} | prompt=${m.usage.prompt_tokens} completion=${m.usage.completion_tokens} ` +
      `total=${m.usage.total_tokens} | ${m.cost.totalCny} ${m.cost.currency} | ${m.durationMs}ms | finish=${m.finishReason}`,
  );
}