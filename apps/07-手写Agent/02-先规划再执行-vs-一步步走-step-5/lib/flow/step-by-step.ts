/**
 * 职责：一步步走（变体 A · 真模型 ReAct）—— 每圈调 openai.chat.completions.create。
 * 数据流：task → messages 循环 → 每圈真发网络请求 → invokeTool → trajectory + finalAnswer。
 * 为什么单独成文件：对照左栏自己的请求只跑这一条。
 */

import { llm } from "../http/runtime-ctx.js";
import { logger } from "../logger.js";
import { invokeTool, TOOLS_OPENAI } from "../tools/ops.js";
import { MAX_ROUNDS, type Round, type ToolCall, type ToolResult } from "../types.js";

const SYSTEM_PROMPT_REACT = [
  "你是一个助手。你的任务是完成用户给的一句话任务。",
  "",
  "每一步只能做下面三件事之一：",
  "1. 调工具（query_stock 查库存 / write_copy 写文案 / notify_ops 通知运营）",
  "2. 给最终答案（不调工具，直接用 content 回答）",
  "",
  "规则：",
  "- 不要预先规划整份清单；每圈看完 tool_result 再决定下一步",
  "- 调工具时给合理参数；调用结果会作为 tool 消息回给你",
  "- 任务完成时给最终答案（不调工具）",
  "- 任务缺信息时（如 SKU 不明 / 通知对象没指定），先调 notify_ops 问清楚，再考虑给最终答案 —— 不要凭空假设",
].join("\n");

export async function runStepByStep(task: string): Promise<{
  task: string;
  trajectory: Round[];
  summary: { rounds: number; modelCalls: number; firstActIndex: number };
  finalAnswer: string;
  stoppedReason: "final_answer" | "max_rounds";
}> {
  const t0 = Date.now();
  logger.info(
    "调用循环-A-一步步走",
    "调用循环开始：一步步走（变体 A · 真模型 ReAct）",
    "为什么写这条日志：本路径是上一节 Agent Loop 同款「每圈 Reason 决定下一刻」；step-2 起换成真模型。当前：用户任务刚进来。",
    { 入参: { task, maxRounds: MAX_ROUNDS }, __code: "const messages = [system, user]; for (let r = 0; r < MAX_ROUNDS; r++) { ... }" },
  );

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM_PROMPT_REACT },
    { role: "user", content: task },
  ];
  const trajectory: Round[] = [];
  let finalAnswer = "";
  let stoppedReason: "final_answer" | "max_rounds" = "max_rounds";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const tRound0 = Date.now();
    logger.info(
      "│ 调用循环-A-一步步走",
      `调用循环开始：第 ${round + 1} 圈 / 共 ${MAX_ROUNDS} 圈`,
      "为什么写这条日志：一步步走每圈 Reason 后才决定这一刻调啥，不看未来。当前：第 N 圈 Reason 即将被模型回答。",
      { 入参: { round: round + 1, messagesLen: messages.length }, __code: "const response = await llm!.openai.chat.completions.create({ messages, tools });" },
    );

    const tLlm0 = Date.now();
    logger.info(
      "││ 调用模型-对话补全",
      "调用模型开始：对话补全",
      "为什么写这条日志：这是真发网络请求的那一次；A 路径每圈都调。当前：第 N 圈；下一步看 finish_reason + tool_calls。",
      { 入参: { messages, tools: TOOLS_OPENAI }, __code: "const response = await llm!.openai.chat.completions.create({ messages, tools });" },
    );
    const response = await llm!.openai.chat.completions.create({
      model: llm!.modelA,
      messages: messages as any,
      tools: TOOLS_OPENAI as any,
    });
    const assistantMessage = response.choices[0]?.message ?? { role: "assistant", content: "" };
    messages.push(assistantMessage as any);
    logger.info(
      "││ 调用模型-对话补全",
      "调用模型结束：对话补全",
      "为什么写这条日志：要看 finish_reason 和 tool_calls 决定下一步。当前：await 已返回；下一步看 tool_calls 是否空（空 = 最终答案）。",
      { 返回值: response, 耗时ms: Date.now() - tLlm0, 字段释义: { "choices[0].finish_reason": "stop = 最终答案 / tool_calls = 要调工具", "choices[0].message.tool_calls": "要执行的工具名和参数", "choices[0].message.content": "assistant 正文（最终答案时用）" } },
    );

    const toolCalls = assistantMessage.tool_calls ?? [];
    const thought = (assistantMessage.content as string) ?? "";

    if (toolCalls.length === 0) {
      finalAnswer = thought || "(模型没给最终答案正文)";
      stoppedReason = "final_answer";
      trajectory.push({ index: round + 1, reason: { tool_calls: [], thought }, act: [], costMs: Date.now() - tRound0 });
      logger.info(
        "│ 调用循环-A-一步步走",
        `调用循环结束：第 ${round + 1} 圈（最终答案）`,
        "为什么写这条日志：tool_calls 空 → 给最终答案 → 收口整条循环。",
        { 返回值: { finalAnswer }, 耗时ms: Date.now() - tRound0 },
      );
      break;
    }

    const act: ToolResult[] = [];
    const thoughtCalls: ToolCall[] = [];
    for (const tc of toolCalls) {
      const tAct0 = Date.now();
      const callObj = { tool: tc.function.name, args: JSON.parse(tc.function.arguments || "{}") };
      thoughtCalls.push(callObj);
      logger.info(
        "│││ 调用函数-invokeTool",
        "调用函数开始：invokeTool",
        "为什么写这条日志：模型已经明确说要这个工具，不调就进不了下一圈。当前：第 N 圈 Reason 后；下一步把 tool_result 塞回 messages。",
        { 入参: { call: callObj }, __code: `const r = invokeTool(${JSON.stringify(callObj)});` },
      );
      const r = invokeTool(callObj);
      logger.info(
        "│││ 调用函数-invokeTool",
        "调用函数结束：invokeTool",
        `为什么写这条日志：要把结果塞回 messages，下一圈模型才能看到。当前：tool=${callObj.tool} ok=${r.ok}。`,
        { 返回值: r, 耗时ms: Date.now() - tAct0 },
      );
      act.push(r);
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(r.result) } as any);
    }

    trajectory.push({ index: round + 1, reason: { tool_calls: thoughtCalls, thought }, act, costMs: Date.now() - tRound0 });
    logger.info(
      "│ 调用循环-A-一步步走",
      `调用循环结束：第 ${round + 1} 圈`,
      "为什么写这条日志：要把这一圈收口；下一步进下一圈（除非到达 MAX_ROUNDS）。",
      { 返回值: { round: trajectory[trajectory.length - 1] }, 耗时ms: Date.now() - tRound0 },
    );
  }

  if (finalAnswer === "") {
    finalAnswer = "(达到 MAX_ROUNDS，未给出最终答案)";
    stoppedReason = "max_rounds";
  }

  logger.info(
    "调用循环-A-一步步走",
    "调用循环结束：一步步走（变体 A · 真模型 ReAct）",
    "为什么写这条日志：跑完收口；下一步回给浏览器对照卡的左栏。",
    { 返回值: { rounds: trajectory.length, modelCalls: trajectory.length, stoppedReason, finalAnswer }, 耗时ms: Date.now() - t0 },
  );

  return {
    task,
    trajectory,
    summary: { rounds: trajectory.length, modelCalls: trajectory.length, firstActIndex: 1 },
    finalAnswer,
    stoppedReason,
  };
}
