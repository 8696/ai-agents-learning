/**
 * 本步核心：手写 while 循环（问模型 → 若要工具就执行 make_latte → 把结果塞回 messages → 再问）。
 *
 * 职责：点咖啡小程序「来一杯中杯热拿铁」的手写 Agent 循环。业务文件里能看见 while。
 *
 * 数据流：utterance → messages=[system,user] → while 未停 → 调协议 A → 有 tool_calls 则执行并追加 role=tool → 无工具则正文当最终答案。
 */
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getLlm } from "../../../../llm.js";
import {
  DEFAULT_UTTERANCE,
  MAKE_LATTE_NAME,
  MAKE_LATTE_OPENAI_TOOL,
  SYSTEM_PROMPT,
  executeMakeLatte,
  type LoopRunResult,
  type MakeLatteArgs,
  type MakeLatteResult,
  type TrajectoryRound,
} from "../cafe/cafe-shared.js";
import { logger } from "../logger.js";

const MAX_ROUNDS = 6;

type Llm = ReturnType<typeof getLlm>;

function parseMakeLatteArgs(raw: string): MakeLatteArgs {
  const parsed = JSON.parse(raw) as { cupSize?: string; drink?: string };
  const cupSize =
    parsed.cupSize === "small" || parsed.cupSize === "large" ? parsed.cupSize : "medium";
  return { cupSize, drink: String(parsed.drink || "latte") };
}

async function callChatCompletions(
  llm: Llm,
  messages: ChatCompletionMessageParam[],
): Promise<{ finishReason: string | null; message: ChatCompletionMessageParam; raw: unknown }> {
  const started = Date.now();
  const 入参 = {
    model: llm.modelA,
    messages,
    tools: [MAKE_LATTE_OPENAI_TOOL],
  };
  logger.info(
    "││ chat.completions",
    "调用模型：openai.chat.completions.create",
    "这一圈要问模型：还要不要调吧台。真发网络请求在这里。",
    { 入参 },
  );
  const raw = await llm.openai.chat.completions.create({
    model: llm.modelA,
    messages,
    tools: [MAKE_LATTE_OPENAI_TOOL],
  });
  const choice = raw.choices[0];
  logger.info(
    "││ chat.completions",
    "结束：openai.chat.completions.create",
    "模型这一圈回来了，看有没有 tool_calls。",
    { 耗时ms: Date.now() - started, 返回值: raw },
  );
  return {
    finishReason: choice?.finish_reason ?? null,
    message: choice?.message as ChatCompletionMessageParam,
    raw,
  };
}

export async function runHandwrittenLoop(utterance: string): Promise<LoopRunResult> {
  const started = Date.now();
  const text = utterance.trim() || DEFAULT_UTTERANCE;
  logger.info("runHandwrittenLoop", "调用函数：runHandwrittenLoop", "入口：手写 while 开始盯这一杯。", {
    入参: { utterance: text, maxRounds: MAX_ROUNDS },
  });
  logger.info("runHandwrittenLoop", "调用函数：runHandwrittenLoop", "函数体就在本文件的 while 里。", {
    __code: runHandwrittenLoop.toString(),
  });

  const llm = getLlm();
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text },
  ];
  const rounds: TrajectoryRound[] = [];
  let modelCallCount = 0;
  let toolExecutedCount = 0;
  let stoppedReason: LoopRunResult["stoppedReason"] = "max_rounds";
  let finalAnswer = "";

  let round = 0;
  while (round < MAX_ROUNDS) {
    round += 1;
    logger.info(
      "│",
      `调用循环开始：第 ${round} 轮 / 共 ${MAX_ROUNDS} 轮`,
      "手写 while 的一圈：问模型，有工具就做，没有就停。",
      { 入参: { round, messages } },
    );
    const roundStarted = Date.now();
    modelCallCount += 1;
    const { finishReason, message } = await callChatCompletions(llm, messages);
    messages.push(message);

    const toolCalls = Array.isArray((message as { tool_calls?: unknown }).tool_calls)
      ? ((message as { tool_calls: Array<{ id: string; function: { name: string; arguments: string } }> })
          .tool_calls)
      : [];
    const toolResults: MakeLatteResult[] = [];
    const toolNames: string[] = [];

    if (toolCalls.length === 0) {
      finalAnswer = String((message as { content?: string | null }).content ?? "");
      stoppedReason = "final_answer";
      rounds.push({
        round,
        modelCalled: true,
        finishReason,
        toolCallCount: 0,
        toolNames: [],
        assistantPreview: finalAnswer.slice(0, 200),
        toolResults: [],
      });
      logger.info("│", `结束：第 ${round} 轮`, "没有 tool_calls，把助手正文当最终答案。", {
        耗时ms: Date.now() - roundStarted,
        返回值: { finishReason, finalAnswer },
      });
      break;
    }

    for (const call of toolCalls) {
      toolNames.push(call.function.name);
      if (call.function.name !== MAKE_LATTE_NAME) {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, error: `unknown_tool:${call.function.name}` }),
        });
        continue;
      }
      const args = parseMakeLatteArgs(call.function.arguments);
      logger.info("││ make_latte", "调用函数：executeMakeLatte", "模型要出杯，执行本地吧台函数。", {
        入参: args,
        __code: executeMakeLatte.toString(),
      });
      const result = executeMakeLatte(args);
      toolExecutedCount += 1;
      toolResults.push(result);
      logger.info("││ make_latte", "结束：executeMakeLatte", "出杯结果要塞回 messages，下一圈模型才看得到。", {
        耗时ms: 0,
        返回值: result,
      });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }

    rounds.push({
      round,
      modelCalled: true,
      finishReason,
      toolCallCount: toolCalls.length,
      toolNames,
      assistantPreview: String((message as { content?: string | null }).content ?? ""),
      toolResults,
    });
    logger.info("│", `结束：第 ${round} 轮`, "这一圈调了吧台，还要再问模型。", {
      耗时ms: Date.now() - roundStarted,
      返回值: { toolNames, toolExecutedCount },
    });
  }

  const 返回值: LoopRunResult = {
    utterance: text,
    hasWhileInBusinessCode: true,
    frameworkPackage: null,
    modelCallCount,
    toolExecutedCount,
    stoppedReason,
    finalAnswer,
    rounds,
    elapsedMs: Date.now() - started,
  };
  logger.info("runHandwrittenLoop", "结束：runHandwrittenLoop", "手写 while 停了。页面应能数圈、看见 make_latte。", {
    耗时ms: 返回值.elapsedMs,
    返回值,
  });
  return 返回值;
}
