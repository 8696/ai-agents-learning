/**
 * 职责：手写 Agent Loop（核心控制流）。**本条教学点 = 变体 G 失败 Observe 后继续**（失败内容跟着 handler 返回值走，loop 不改 Act）。
 *
 * 数据流：
 *   messages: [{role, content}, ...]   ← 入参
 *     │
 *     │ while (没碰上停止条件 && round < MAX_ROUNDS)
 *     │   ├─ Reason：openai.chat.completions.create({ messages, tools })
 *     │   ├─ ① 把 assistant_message 追加进 messages
 *     │   ├─ 若 tool_calls 为空 → 最终答案 → break（变体 J）
 *     │   ├─ ② Act：Promise.all 并行 map 调 executeOneTool
 *     │   └─ 进下一圈
 *     │
 *     ▼
 *   返回 { trajectory, finalAnswer, stoppedReason, rounds }
 *
 * 停止条件：变体 J 最终答案 / 保护型 MAX_ROUNDS（兜底）。
 */

import type OpenAI from "openai";
import { logger } from "../logger.js";
import { todoToolRegistry } from "../tools/todo-tools.js";
import { executeOneTool } from "./execute-one-tool.js";
import type { LoopResult, RunLoopParams, ToolCallLite, TrajectoryStep } from "./types.js";

export type { ChatMessage, LoopResult, RunLoopParams, ToolCallLite, TrajectoryStep } from "./types.js";

export async function runAgentLoop(params: RunLoopParams): Promise<LoopResult> {
  const { openai, model, initialMessages } = params;
  const maxRounds = params.maxRounds ?? 6;

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

    messages.push({
      role: "assistant",
      content: assistantContent,
      tool_calls: rawToolCalls.map((c) => ({
        id: c.id,
        type: "function" as const,
        function: c.function,
      })),
    });

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

    // ── ② Act：变体 E 并行 —— Promise.all 同时启动所有 executeOneTool ──
    // 完成顺序 ≠ toolCalls 数组顺序（先返回的先 push 进 messages）。
    // OpenAI Messages API tool 消息靠 tool_call_id 引用，跟 push 顺序无关，所以并行安全。
    const parallelSettled = await Promise.all(
      toolCalls.map((call) => executeOneTool(call, messages)),
    );
    const toolResults = parallelSettled.map((r) => r.toolResult);

    const parallelMaxToolMs = parallelSettled.length > 0 ? Math.max(...parallelSettled.map(r => r.elapsedMs)) : 0;
    const parallelSumToolMs = parallelSettled.reduce((s, r) => s + r.elapsedMs, 0);
    logger.info("││ 调用函数-并行汇总", "调用函数结束：并行汇总（变体 E）",
      "为什么写这条日志：让学习者一眼看到 Promise.all 后单圈耗时 = max(各 tool_call)，对比串行会是 sum。当前：第 " + round + " 圈有 " + parallelSettled.length + " 个 tool_call 并行执行。",
      {
        parallelCount: parallelSettled.length,
        实际并行耗时ms: parallelMaxToolMs,
        若串行总耗时ms: parallelSumToolMs,
        节省ms: parallelSumToolMs - parallelMaxToolMs,
      });

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
  }

  if (round >= maxRounds && stoppedReason === "final_answer") {
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
