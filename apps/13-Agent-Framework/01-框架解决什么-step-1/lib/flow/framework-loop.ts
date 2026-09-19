/**
 * 本步核心：Vercel AI SDK 内部转圈（业务文件里没有 while）。
 *
 * 职责：同一句「来一杯中杯热拿铁」，用 generateText + make_latte 让库去跑工具循环。
 *
 * 数据流：utterance → generateText({ tools, stopWhen: isStepCount(5) }) → 库内部反复调模型并执行 execute → 返回 text 与 steps。
 */
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { getLlm } from "../../../../llm.js";
import {
  DEFAULT_UTTERANCE,
  MAKE_LATTE_DESCRIPTION,
  MAKE_LATTE_NAME,
  SYSTEM_PROMPT,
  executeMakeLatte,
  type LoopRunResult,
  type TrajectoryRound,
} from "../cafe/cafe-shared.js";
import { logger } from "../logger.js";

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
    toolExecutedCount += toolCalls.filter((item) => item.toolName === MAKE_LATTE_NAME).length;
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

export async function runFrameworkLoop(utterance: string): Promise<LoopRunResult> {
  const started = Date.now();
  const text = utterance.trim() || DEFAULT_UTTERANCE;
  logger.info("runFrameworkLoop", "调用函数：runFrameworkLoop", "入口：业务代码里没有 while，循环交给 AI SDK。", {
    入参: { utterance: text },
  });
  logger.info("runFrameworkLoop", "调用函数：runFrameworkLoop", "函数体：createOpenAI + generateText + tool(make_latte)。", {
    __code: runFrameworkLoop.toString(),
  });

  const llm = getLlm();
  const provider = createOpenAI({
    apiKey: llm.apiKey,
    baseURL: llm.baseUrlA,
    name: llm.provider,
  });
  const model = provider.chat(llm.modelA);
  const makeLatteTool = tool({
    description: MAKE_LATTE_DESCRIPTION,
    inputSchema: z.object({
      cupSize: z.enum(["small", "medium", "large"]).describe("杯型"),
      drink: z.string().describe("饮品英文名，例如 latte"),
    }),
    execute: async (raw) => {
      logger.info("│ make_latte", "调用函数：executeMakeLatte", "库内部要出杯，仍执行你注册的本地函数。", {
        入参: raw,
        __code: executeMakeLatte.toString(),
      });
      const result = executeMakeLatte(raw);
      logger.info("│ make_latte", "结束：executeMakeLatte", "结果交回 SDK，由它塞回下一圈。", {
        耗时ms: 0,
        返回值: result,
      });
      return result;
    },
  });

  const 入参 = {
    model: llm.modelA,
    system: SYSTEM_PROMPT,
    prompt: text,
    tools: { [MAKE_LATTE_NAME]: "tool(make_latte)" },
    stopWhen: "isStepCount(5)",
  };
  logger.info(
    "│ generateText",
    "调用函数：generateText",
    "真发网络请求发生在 AI SDK 内部。业务文件搜不到 while。",
    { 入参 },
  );

  const generateStarted = Date.now();
  const raw = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: text,
    tools: { [MAKE_LATTE_NAME]: makeLatteTool },
    stopWhen: isStepCount(5),
  });
  logger.info("│ generateText", "结束：generateText", "库把圈转完了，text 是最终对客人说的话。", {
    耗时ms: Date.now() - generateStarted,
    返回值: raw,
  });

  const mapped = mapSteps(raw.steps ?? []);
  const 返回值: LoopRunResult = {
    utterance: text,
    hasWhileInBusinessCode: false,
    frameworkPackage: "ai + @ai-sdk/openai",
    modelCallCount: mapped.rounds.length,
    toolExecutedCount: mapped.toolExecutedCount,
    stoppedReason: "final_answer",
    finalAnswer: String(raw.text ?? ""),
    rounds: mapped.rounds,
    elapsedMs: Date.now() - started,
  };
  logger.info("runFrameworkLoop", "结束：runFrameworkLoop", "对照手写页：本文件没有 while，但 make_latte 仍被执行。", {
    耗时ms: 返回值.elapsedMs,
    返回值,
  });
  return 返回值;
}
