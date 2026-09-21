/**
 * 本步核心：同一句 query「热美式和冰拿铁各来一杯。」，两条路径 —— 默认并行 vs 强制串行。
 *
 * 职责：缺口 #5（变体 C · 工具编排 / 并行）。本课注册两个工具 make_americano + make_latte
 *       （杯型都是 small / medium / large）。左栏一次 generateText 让模型一次返回 2 个
 *       tool_calls（每个工具各一次），SDK 默认并行执行；右栏分 2 次 generateText 强制串行。
 *
 * 数据流：utterance → runMultiDrinkParallel（并行）/ runMultiDrinkSerial（串行）→ LoopRunResult。
 *         两条路径的工具执行策略相反，但最终都出 2 杯咖啡（美式 + 拿铁）。对照 elapsedMs。
 */
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, hasToolCall, isStepCount, tool } from "ai";
import { z } from "zod";
import { getLlm } from "../../../../llm.js";
import {
  SYSTEM_PROMPT,
  type LoopRunResult,
  type TrajectoryRound,
} from "../cafe/cafe-shared.js";
import { logger } from "../logger.js";

const MULTI_DRINK_UTTERANCE = "热美式和冰拿铁各来一杯。";
const SERIAL_STEP1_UTTERANCE = "先做一杯中杯热美式。";
const SERIAL_STEP2_UTTERANCE = "再做一杯中杯冰拿铁。";
const MAKE_AMERICANO_NAME = "make_americano";
const MAKE_LATTE_NAME = "make_latte";

type SdkStep = {
  text?: string;
  finishReason?: string;
  toolCalls?: Array<{ toolName?: string }>;
};

function mapSteps(steps: SdkStep[]): { rounds: TrajectoryRound[]; toolExecutedCount: number } {
  const rounds: TrajectoryRound[] = [];
  let toolExecutedCount = 0;
  (steps ?? []).forEach((step, index) => {
    const toolCalls = step.toolCalls ?? [];
    const toolNames = toolCalls.map((item) => String(item.toolName ?? ""));
    // 工具调用次数：所有 tool_calls 都算（make_americano + make_latte 都计）
    toolExecutedCount += toolCalls.length;
    rounds.push({
      round: index + 1,
      modelCalled: true,
      finishReason: step.finishReason ?? null,
      toolCallCount: toolCalls.length,
      toolNames,
      assistantPreview: String(step.text ?? "").slice(0, 200),
      toolResults: [],
    });
  });
  return { rounds, toolExecutedCount };
}

function registerMakeAmericanoTool() {
  return tool({
    description:
      "在吧台做一杯美式咖啡。客人点美式时必须调用此工具。杯型：小杯 small、中杯 medium、大杯 large。不要在没调用本工具时声称已经出杯。",
    inputSchema: z.object({
      cupSize: z.enum(["small", "medium", "large"]).describe("杯型"),
    }),
    execute: async (raw) => {
      logger.info("│ make_americano", "调用函数：executeMakeAmericano", "出美式一杯。", {
        入参: raw,
      });
      const cupSize = raw.cupSize;
      const cupLabel = cupSize === "small" ? "小杯" : cupSize === "large" ? "大杯" : "中杯";
      const result = { ok: true, cupSize, drink: "americano", message: `${cupLabel}美式咖啡 已经做好了，大约 3 分钟。` };
      logger.info("│ make_americano", "结束：executeMakeAmericano", "出杯完成。", {
        耗时ms: 0,
        返回值: result,
      });
      return result;
    },
  });
}

function registerMakeLatteTool() {
  return tool({
    description:
      "在吧台做一杯拿铁（含奶咖）。客人点拿铁时必须调用此工具。杯型：小杯 small、中杯 medium、大杯 large。不要在没调用本工具时声称已经出杯。",
    inputSchema: z.object({
      cupSize: z.enum(["small", "medium", "large"]).describe("杯型"),
    }),
    execute: async (raw) => {
      logger.info("│ make_latte", "调用函数：executeMakeLatte", "出拿铁一杯。", {
        入参: raw,
      });
      const cupSize = raw.cupSize;
      const cupLabel = cupSize === "small" ? "小杯" : cupSize === "large" ? "大杯" : "中杯";
      const result = { ok: true, cupSize, drink: "latte", message: `${cupLabel}拿铁 已经做好了，大约 3 分钟。` };
      logger.info("│ make_latte", "结束：executeMakeLatte", "出杯完成。", {
        耗时ms: 0,
        返回值: result,
      });
      return result;
    },
  });
}

// 并行：一次 generateText；模型一次返回 2 个 tool_calls（make_americano + make_latte）；
// SDK 默认并行执行；elapsedMs ≈ 1 杯（两杯同时做）。
export async function runMultiDrinkParallel(): Promise<LoopRunResult> {
  const started = Date.now();
  const text = MULTI_DRINK_UTTERANCE;
  logger.info(
    "runMultiDrinkParallel",
    "调用函数：runMultiDrinkParallel",
    "入口：一次 generateText；模型一次返回 2 个 tool_calls（make_americano + make_latte），SDK 默认并行执行（类似 Promise.all）。",
    {
      入参: { utterance: text },
    }
  );

  const llm = getLlm();
  const provider = createOpenAI({
    apiKey: llm.apiKey,
    baseURL: llm.baseUrlA,
    name: llm.provider,
  });
  const model = provider.chat(llm.modelA);
  const makeAmericanoTool = registerMakeAmericanoTool();
  const makeLatteTool = registerMakeLatteTool();

  const 入参 = {
    model: llm.modelA,
    system: SYSTEM_PROMPT,
    prompt: text,
    tools: { [MAKE_AMERICANO_NAME]: "tool(make_americano)", [MAKE_LATTE_NAME]: "tool(make_latte)" },
    stopWhen: "isStepCount(5)",
    工具执行策略: "默认并行（一次 generateText 内多 tool_calls 同时执行）",
  };
  logger.info("│ generateText", "调用函数：generateText（并行）", "两杯咖啡（美式 + 拿铁）同时做，elapsedMs ≈ 1 杯。", { 入参 });

  const generateStarted = Date.now();
  const raw = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: text,
    tools: {
      [MAKE_AMERICANO_NAME]: makeAmericanoTool,
      [MAKE_LATTE_NAME]: makeLatteTool,
    },
    stopWhen: isStepCount(5),
  });
  logger.info("│ generateText", "结束：generateText（并行）", "两杯同时完成。", {
    耗时ms: Date.now() - generateStarted,
    返回值: raw,
  });

  const mapped = mapSteps(raw.steps ?? []);
  const 返回值: LoopRunResult = {
    utterance: text,
    hasWhileInBusinessCode: false,
    frameworkPackage: "ai + @ai-sdk/openai (parallel)",
    modelCallCount: mapped.rounds.length,
    toolExecutedCount: mapped.toolExecutedCount,
    stoppedReason: mapped.rounds.length >= 5 ? "max_rounds" : "final_answer",
    finalAnswer: String(raw.text ?? ""),
    rounds: mapped.rounds,
    elapsedMs: Date.now() - started,
  };
  logger.info("runMultiDrinkParallel", "结束：runMultiDrinkParallel", "左栏（并行）完成。", {
    耗时ms: 返回值.elapsedMs,
    返回值,
  });
  return 返回值;
}

// 串行：分 2 次 generateText；每轮只注册 1 个工具 + query 拆开，让模型只能调 1 个 tool_call。
// 第 1 轮：tools = { make_americano }，prompt = "先做一杯中杯热美式" → 模型只调 make_americano。
// 第 2 轮：tools = { make_latte }，prompt = "再做一杯中杯冰拿铁" + 第 1 轮消息 → 模型只调 make_latte。
// elapsedMs ≈ 2 杯。
export async function runMultiDrinkSerial(): Promise<LoopRunResult> {
  const started = Date.now();
  logger.info(
    "runMultiDrinkSerial",
    "调用函数：runMultiDrinkSerial",
    "入口：分 2 次 generateText，每轮只注册 1 个工具 + 拆 query；elapsedMs ≈ 2 杯。",
    {
      入参: { step1Query: SERIAL_STEP1_UTTERANCE, step2Query: SERIAL_STEP2_UTTERANCE },
    }
  );

  const llm = getLlm();
  const provider = createOpenAI({
    apiKey: llm.apiKey,
    baseURL: llm.baseUrlA,
    name: llm.provider,
  });
  const model = provider.chat(llm.modelA);
  const makeAmericanoTool = registerMakeAmericanoTool();
  const makeLatteTool = registerMakeLatteTool();

  // 第 1 轮：只注册 make_americano + prompt 改「先做美式」
  logger.info("│ generateText", "调用函数：generateText（串行第 1 轮 · 美式）", "只注册 make_americano，模型只能调 1 个工具。", {
    prompt: SERIAL_STEP1_UTTERANCE,
    tools: [MAKE_AMERICANO_NAME],
    stopWhen: 'hasToolCall("make_americano")',
  });
  const gen1Started = Date.now();
  const raw1 = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: SERIAL_STEP1_UTTERANCE,
    tools: {
      [MAKE_AMERICANO_NAME]: makeAmericanoTool,
    },
    stopWhen: hasToolCall(MAKE_AMERICANO_NAME),
  });
  logger.info("│ generateText", "结束：generateText（串行第 1 轮 · 美式）", "第 1 杯美式完成。", {
    耗时ms: Date.now() - gen1Started,
    返回值: raw1,
  });

  // 第 2 轮：只注册 make_latte + prompt 改「再做拿铁」+ 把第 1 轮消息塞回
  logger.info("│ generateText", "调用函数：generateText（串行第 2 轮 · 拿铁）", "只注册 make_latte，模型只能调 1 个工具。", {
    prompt: SERIAL_STEP2_UTTERANCE,
    tools: [MAKE_LATTE_NAME],
    stopWhen: 'hasToolCall("make_latte")',
  });
  const gen2Started = Date.now();
  const raw2 = await generateText({
    model,
    system: SYSTEM_PROMPT,
    messages: [
      ...raw1.response.messages,
      { role: "user", content: SERIAL_STEP2_UTTERANCE },
    ],
    tools: {
      [MAKE_LATTE_NAME]: makeLatteTool,
    },
    stopWhen: hasToolCall(MAKE_LATTE_NAME),
  });
  logger.info("│ generateText", "结束：generateText（串行第 2 轮 · 拿铁）", "第 2 杯拿铁完成。", {
    耗时ms: Date.now() - gen2Started,
    返回值: raw2,
  });

  const mapped1 = mapSteps(raw1.steps ?? []);
  const mapped2 = mapSteps(raw2.steps ?? []);
  const totalRounds = mapped1.rounds.length + mapped2.rounds.length;
  const totalExec = mapped1.toolExecutedCount + mapped2.toolExecutedCount;
  const 返回值: LoopRunResult = {
    utterance: MULTI_DRINK_UTTERANCE,
    hasWhileInBusinessCode: false,
    frameworkPackage: "ai + @ai-sdk/openai (serial)",
    modelCallCount: totalRounds,
    toolExecutedCount: totalExec,
    stoppedReason: "final_answer",
    finalAnswer: String(raw2.text ?? raw1.text ?? ""),
    rounds: [...mapped1.rounds, ...mapped2.rounds],
    elapsedMs: Date.now() - started,
  };
  logger.info("runMultiDrinkSerial", "结束：runMultiDrinkSerial", "右栏（串行）完成。", {
    耗时ms: 返回值.elapsedMs,
    返回值,
  });
  return 返回值;
}