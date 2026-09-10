/**
 * 职责：先规划再执行（变体 B · 真规划器）—— 一次吐清单，再按清单调工具。
 * 数据流：task → planWithLlm（失败则 mock + plannerFallback）→ 按步 invokeTool → executeTrace。
 * 为什么单独成文件：对照右栏自己的请求只跑这一条。
 */

import { llm } from "../http/runtime-ctx.js";
import { logger } from "../logger.js";
import { invokeTool } from "../tools/ops.js";
import type { ExecuteTrace, PlanStep } from "../types.js";
import { FALLBACK_PLAN, planWithLlm } from "./parse-plan.js";

export async function runPlanAndExecute(task: string): Promise<{
  task: string;
  plan: PlanStep[];
  plannerRawText: string;
  plannerFallback: boolean;
  executeTrace: ExecuteTrace[];
  summary: { planCalls: number; executeCalls: number; firstActIndex: number };
  finalAnswer: string;
}> {
  const t0 = Date.now();
  logger.info(
    "调用循环-B-先规划",
    "调用循环开始：先规划再执行（变体 B · step-2 真规划器）",
    "为什么写这条日志：这条路径在第一次 Act 之前先吐一份「计划」对象；step-2 用真模型吐。当前：用户任务刚进来。",
    { 入参: { task }, __code: "const { plan, rawText, fallback } = await planWithLlm(task);" },
  );

  const tPlan0 = Date.now();
  logger.info(
    "│ 调用函数-planner",
    "调用函数开始：planner",
    "为什么写这条日志：这里是「先规划」的关键跳 —— 真模型一次性吐完整清单。当前：task 进来；下一步把 plan 交执行器。",
    { 入参: { task }, __code: "const { plan, rawText } = await planWithLlm(task);" },
  );
  let plan: PlanStep[];
  let plannerRawText = "";
  let plannerFallback = false;
  if (llm) {
    const r = await planWithLlm(task);
    if (r.plan.length > 0) {
      plan = r.plan;
      plannerRawText = r.rawText;
      plannerFallback = false;
    } else {
      plan = FALLBACK_PLAN;
      plannerRawText = r.rawText;
      plannerFallback = true;
      logger.warn(
        "│ 调用函数-planner",
        "调用函数：planner 解析失败，回退 mock plan",
        "为什么写这条日志：模型吐的文本没解析出任何「步骤 N：...」行；前端要看 plannerFallback=true。",
        { rawText: plannerRawText },
      );
    }
  } else {
    plan = FALLBACK_PLAN;
    plannerRawText = "(no LLM — runtime-ctx.llm is null; mock plan used)";
    plannerFallback = true;
    logger.warn(
      "│ 调用函数-planner",
      "调用函数：llm 未就绪，回退 mock plan",
      "为什么写这条日志：缺 Key / 没配模型；前端要看 plannerFallback=true。",
      { llmNull: true },
    );
  }
  logger.info(
    "│ 调用函数-planner",
    "调用函数结束：planner",
    "为什么写这条日志：计划作为对象存在；下一步才能「第一次 Act」。",
    { 返回值: { plan, plannerFallback, plannerRawTextLen: plannerRawText.length }, 耗时ms: Date.now() - tPlan0, 字段释义: { "plan[].tool": "要调的工具名", "plan[].args": "工具参数", "plan[].reason": "这一步为什么这么做", "plannerFallback": "true = 模型吐的没解析出来或缺 Key，用了 mock 兜底" } },
  );

  logger.info(
    "调用循环-B-先规划",
    "调用循环开始：执行阶段",
    "为什么写这条日志：执行阶段本身仍可能循环（这里就是按清单循环），但每一步不再问大模型「此刻调啥」。当前：plan 已就位。",
    { 入参: { stepCount: plan.length }, __code: "for (const step of plan) { ... }" },
  );

  const executeTrace: ExecuteTrace[] = [];
  for (let i = 0; i < plan.length; i++) {
    const step = plan[i];
    const tStep0 = Date.now();
    logger.info(
      "││ 调用循环-B-先规划",
      `调用循环开始：第 ${i + 1} 步 / 共 ${plan.length} 步`,
      "为什么写这条日志：执行阶段的每一步都按清单调，不问模型。当前：执行清单第 N 步。",
      { 入参: { step }, __code: "const r = invokeTool({ tool: step.tool, args: step.args });" },
    );
    const r = invokeTool({ tool: step.tool, args: step.args });
    const trace: ExecuteTrace = { index: i + 1, step, result: r, costMs: Date.now() - tStep0 };
    executeTrace.push(trace);
    logger.info(
      "││ 调用循环-B-先规划",
      `调用循环结束：第 ${i + 1} 步`,
      "为什么写这条日志：收口当前步骤；下一步看清单还有没有。",
      { 返回值: trace, 耗时ms: Date.now() - tStep0 },
    );
  }
  logger.info(
    "调用循环-B-先规划",
    "调用循环结束：执行阶段",
    "为什么写这条日志：清单走完；下一步拼最终答案。",
    { 返回值: { executeCount: executeTrace.length }, 耗时ms: Date.now() - t0 },
  );

  const finalAnswer = "上新完成：SKU-88（12 件）/ SKU-89（7 件）已写文案，SKU-90 缺货已记录，运营已通知。";
  logger.info(
    "调用循环-B-先规划",
    "调用循环结束：先规划再执行（变体 B · step-2 真规划器）",
    "为什么写这条日志：跑完收口；下一步回给浏览器对照卡的右栏。",
    { 返回值: { planSteps: plan.length, executeCount: executeTrace.length, finalAnswer, plannerFallback }, 耗时ms: Date.now() - t0 },
  );

  return {
    task,
    plan,
    plannerRawText,
    plannerFallback,
    executeTrace,
    summary: { planCalls: 1, executeCalls: executeTrace.length, firstActIndex: 1 },
    finalAnswer,
  };
}
