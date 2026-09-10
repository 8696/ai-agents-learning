/**
 * 职责：手写 Agent Loop（核心控制流）。**本条教学点**。
 *
 * 数据流：
 *   messages: [{role, content}, ...]   ← 入参
 *     │
 *     │ while (没碰上停止条件 && round < MAX_ROUNDS)
 *     │   ├─ Reason：openai.chat.completions.create({ messages, tools })
 *     │   │   └─ assistant_message（可能含 tool_calls）
 *     │   ├─ ① 把 assistant_message 追加进 messages（让模型「记住」自己说过）
 *     │   ├─ 若 assistant_message.tool_calls 为空 → 最终答案 → break（变体 J）
 *     │   ├─ ② Act：对每个 tool_call 调 executeOneTool（查 registry → handler → Observe 写回）
 *     │   └─ 进下一圈
 *     │
 *     ▼
 *   返回 { trajectory, finalAnswer, stoppedReason, rounds }
 *
 * 停止条件：
 *   - 变体 J 最终答案：本圈 assistant_message.tool_calls 为空 → 正文即答案 → break
 *   - 保护型 MAX_ROUNDS：打到上限不再继续；轨迹照写、不抛错；UI 标「达到最大轮次」
 *
 * 本 step 只演示 J + MAX（兜底，不指望触发）。
 */

import type OpenAI from "openai";
import { logger } from "../logger.js";
import { todoToolRegistry } from "../tools/todo-tools.js";
import { executeOneTool } from "./execute-one-tool.js";
import type { LoopResult, RunLoopParams, ToolCallLite, TrajectoryStep } from "./types.js";

export type { ChatMessage, LoopResult, RunLoopParams, ToolCallLite, TrajectoryStep } from "./types.js";

/** 本 step 的停止条件只有「最终答案 / max_rounds」两种。其它留 step-2+。 */
export async function runAgentLoop(params: RunLoopParams): Promise<LoopResult> {
  const { openai, model, initialMessages } = params;
  const maxRounds = params.maxRounds ?? 6;

  // messages 是循环**唯一**的状态容器：每圈改一次（追加 assistant + tool）
  // 类型 = OpenAI SDK 原生，序列化时 tool_calls 字段名 / tool_call_id 引用关系正确。
  const messages: LoopResult["finalMessages"] = [...initialMessages];
  const trajectory: TrajectoryStep[] = [];

  let round = 0;
  let finalAnswer = "";
  let stoppedReason: LoopResult["stoppedReason"] = "final_answer";

  while (round < maxRounds) {
    round += 1;

    logger.info("│ 调用循环", "调用循环开始：" + `第 ${round} 轮 / 共 ${maxRounds} 轮`,
      "为什么写这条日志：本条教学点 = Loop 在转；不每圈都写完整，事后只看日志讲不清「圈 N 发生了什么」。当前：即将发请求让模型 Reason。",
      {
        第几轮: round,
        本轮为什么是这些参数: {
          messages: "累积到目前为止全部 messages（含 system / user / 多圈 assistant+tool）—— Loop 的唯一状态容器",
          tools: `本条 2 个 tool：${todoToolRegistry.definitions.map(t => t.function.name).join(" / ")}`,
        },
      });

    const tRound0 = Date.now();

    // ── Reason：调一次 LLM ──
    const request: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      tools: todoToolRegistry.definitions as unknown as OpenAI.Chat.ChatCompletionTool[],
    };

    logger.info("││ 调用模型-对话补全", "调用模型开始：对话补全",
      "为什么写这条日志：这是真发网络请求的那一次，不写就讲不清这一圈 Reason 看见了什么。当前：第 " + round + " 圈，messages 累积了 " + messages.length + " 条。",
      {
        入参: request,
        __code: "const completion = await openai.chat.completions.create(request);",
      });

    const t0 = Date.now();
    let completion;
    try {
      completion = await openai.chat.completions.create(request);
    } catch (err: unknown) {
      logger.error("││ 调用模型-对话补全", "调用模型结束：对话补全（失败）",
        "为什么写这条日志：网络/限流/超时 等真发请求的失败；不能让 Loop 静默死掉。当前：await 抛错；下一步直接把错误冒到路由层回 502。",
        { error: err, 耗时ms: Date.now() - t0 });
      throw err;
    }

    const assistantMessage = completion.choices[0]?.message;
    const rawToolCalls = assistantMessage?.tool_calls ?? [];
    const toolCalls: ToolCallLite[] = rawToolCalls.map((c) => ({
      id: c.id,
      type: "function" as const,
      function: { name: c.function.name, arguments: c.function.arguments },
    }));
    const assistantContent = assistantMessage?.content ?? null;

    logger.info("││ 调用模型-对话补全", "调用模型结束：对话补全",
      "为什么写这条日志：要拿到 tool_calls 决定下一步是 Act 还是最终答案；finish_reason 是关键判据。当前：已返回。",
      {
        返回值: {
          choices: completion.choices,
          usage: completion.usage ?? null,
          finish_reason: completion.choices[0]?.finish_reason,
        },
        字段释义: {
          "choices[0].finish_reason": "tool_calls = 还要做；stop = 正文即最终答案；length = 截断",
          "choices[0].message.tool_calls": "本圈模型决定要调的工具列表；空数组 = 变体 J 最终答案",
          "choices[0].message.content": "本圈 assistant 文本（可能为 null 当只调工具）",
        },
        耗时ms: Date.now() - t0,
      });

    // ── ① 把 assistant_message 追加进 messages（让模型下一圈能看到自己刚才说了什么）──
    messages.push({
      role: "assistant",
      content: assistantContent,
      tool_calls: rawToolCalls.map((c) => ({
        id: c.id,
        type: "function" as const,
        function: c.function,
      })),
    });

    // ── 停止条件 J：最终答案（tool_calls 为空）──
    if (toolCalls.length === 0) {
      finalAnswer = assistantContent ?? "";
      stoppedReason = "final_answer";
      trajectory.push({
        round,
        assistant: { content: assistantContent, tc: [] },
        toolResults: [],
        elapsedMs: Date.now() - tRound0,
      });
      logger.info("│ 调用循环", `调用循环结束：第 ${round} 轮（最终答案 · 变体 J）`,
        "为什么写这条日志：本圈 tool_calls 空 → 模型认为做完了；正文就是最终答案，break。当前：loop 退出。",
        { 最终答案: finalAnswer, 耗时ms: Date.now() - tRound0 });
      break;
    }

    // ── ② Act + ③ Observe：串行执行每个 tool_call ──
    const toolResults: TrajectoryStep["toolResults"] = [];
    for (const call of toolCalls) {
      toolResults.push(await executeOneTool(call, messages, round));
    }

    trajectory.push({
      round,
      assistant: { content: assistantContent, tc: toolCalls },
      toolResults,
      elapsedMs: Date.now() - tRound0,
    });

    logger.info("│ 调用循环", `调用循环结束：第 ${round} 轮`,
      "为什么写这条日志：本圈 Act+Observe 已写进 messages，下一圈 Reason 会读到。当前：trajectory 加 1 行；继续 while。",
      {
        本轮轨迹: {
          assistantContent: assistantContent,
          toolCalls: toolCalls.map(c => ({ id: c.id, name: c.function.name, arguments: c.function.arguments })),
          toolResultsCount: toolResults.length,
        },
        耗时ms: Date.now() - tRound0,
      });

    // 注：step-1 不内置 K（max 当教学点）+ L（超时）+ M（用户取消）；变体 J 是本 step 唯一「主出口」。
    // K 在这里只作兜底（while 条件 round < maxRounds），不指望触发。
  }

  if (round >= maxRounds && stoppedReason === "final_answer") {
    // 走到这里只可能是 stoppedReason 没被 J 设过 —— 说明 while 是被条件 break 而不是被 J break，
    // 即 MAX 兜底触发。
    stoppedReason = "max_rounds";
    logger.warn("调用循环-loop", "调用循环结束：MAX_ROUNDS 兜底触发",
      "为什么写这条日志：本 step 把 max 当兜底；若跑到这里说明任务模型一直没收敛（变体 K · 不指望触发）。",
      { round, maxRounds });
  }

  return {
    trajectory,
    finalAnswer: finalAnswer || "（模型未给出最终答案 · 任务未收敛）",
    stoppedReason,
    rounds: round,
    finalMessages: messages,
  };
}
