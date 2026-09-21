/**
 * 本步核心：同一问句，两条路径 —— 直接调模型 vs 套框架 Agent。
 *
 * 职责：缺口 #4（变体 H · 抽象不合适）。同一问句「吧台能做什么咖啡」，左栏不
 *       带 tools 直接调；右栏带 make_latte 工具调。对照「Agent 框架多走的步数」= 抽象的负担。
 *
 * 数据流：utterance → runFaqDirect（无 tools）或 runFaqAgent（带 tools）→ LoopRunResult。
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

// 直接调：generateText({ prompt, system })，不带 tools。1 步就完成。
export async function runFaqDirect(utterance: string): Promise<LoopRunResult> {
  const started = Date.now();
  const text = utterance.trim() || DEFAULT_UTTERANCE;
  logger.info(
    "runFaqDirect",
    "调用函数：runFaqDirect",
    "入口：FAQ 问句直接调模型，不带 tools。业务代码里没有 agent 框架、没有 while。",
    {
      入参: { utterance: text },
    }
  );
  logger.info("runFaqDirect", "调用函数：runFaqDirect", "函数体：createOpenAI + generateText（无 tools）。", {
    __code: runFaqDirect.toString(),
  });

  const llm = getLlm();
  const provider = createOpenAI({
    apiKey: llm.apiKey,
    baseURL: llm.baseUrlA,
    name: llm.provider,
  });
  const model = provider.chat(llm.modelA);

  const 入参 = {
    model: llm.modelA,
    system: SYSTEM_PROMPT,
    prompt: text,
    tools: "无 tools",
    stopWhen: "无（直接调用）",
  };
  logger.info("│ generateText", "调用函数：generateText（无 tools）", "直接调一次模型；模型自己决定要不要调工具——这里没有工具可选。", {
    入参,
  });

  const generateStarted = Date.now();
  const raw = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: text,
  });
  logger.info("│ generateText", "结束：generateText", "直接调 1 轮就出答案。", {
    耗时ms: Date.now() - generateStarted,
    返回值: raw,
  });

  const mapped = mapSteps(raw.steps ?? []);
  const 返回值: LoopRunResult = {
    utterance: text,
    hasWhileInBusinessCode: false,
    frameworkPackage: null,
    modelCallCount: mapped.rounds.length,
    toolExecutedCount: mapped.toolExecutedCount,
    stoppedReason: "final_answer",
    finalAnswer: String(raw.text ?? ""),
    rounds: mapped.rounds,
    elapsedMs: Date.now() - started,
  };
  logger.info("runFaqDirect", "结束：runFaqDirect", "左栏（直接调）已完成：1 轮、无工具调用。", {
    耗时ms: 返回值.elapsedMs,
    返回值,
  });
  return 返回值;
}

// 套框架 Agent：generateText({ prompt, system, tools: { make_latte }, stopWhen: isStepCount(5) })。
// 即使 FAQ 问句，agent 路径会带 tools + stopWhen；模型可能调 make_latte（看 system prompt）。
export async function runFaqAgent(utterance: string): Promise<LoopRunResult> {
  const started = Date.now();
  const text = utterance.trim() || DEFAULT_UTTERANCE;
  logger.info(
    "runFaqAgent",
    "调用函数：runFaqAgent",
    "入口：FAQ 问句硬套出杯图（带 make_latte 工具 + stopWhen）。即使 FAQ，框架按 agent 形式跑。",
    {
      入参: { utterance: text },
    }
  );
  logger.info("runFaqAgent", "调用函数：runFaqAgent", "函数体：createOpenAI + generateText + tool(make_latte) + stopWhen。", {
    __code: runFaqAgent.toString(),
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
      logger.info("│ make_latte", "调用函数：executeMakeLatte", "FAQ 场景下不该调的工具：还是被 agent 调到了。", {
        入参: raw,
        __code: executeMakeLatte.toString(),
      });
      const result = executeMakeLatte(raw);
      logger.info("│ make_latte", "结束：executeMakeLatte", "结果交回 SDK。", {
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
    "调用函数：generateText（带 tools）",
    "FAQ 场景下不该套的工具：但框架 agent 形式带了 make_latte；模型可能调也可能不调。",
    { 入参 }
  );

  const generateStarted = Date.now();
  const raw = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: text,
    tools: { [MAKE_LATTE_NAME]: makeLatteTool },
    stopWhen: isStepCount(5),
  });
  logger.info("│ generateText", "结束：generateText", "agent 形式跑完（可能 1 步也可能多步调工具）。", {
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
    stoppedReason: mapped.rounds.length >= 5 ? "max_rounds" : "final_answer",
    finalAnswer: String(raw.text ?? ""),
    rounds: mapped.rounds,
    elapsedMs: Date.now() - started,
  };
  logger.info("runFaqAgent", "结束：runFaqAgent", "右栏（套框架 Agent）已完成：agent 形式带工具，即使 FAQ 问句也可能多调一步。", {
    耗时ms: 返回值.elapsedMs,
    返回值,
  });
  return 返回值;
}