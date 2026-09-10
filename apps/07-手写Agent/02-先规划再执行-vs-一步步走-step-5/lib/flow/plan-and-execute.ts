/**
 * 职责：先规划再执行（变体 B · 真规划器 + 重规划）—— 执行每步后 shouldReplan，触发则换 plan。
 * 数据流：task → doPlan(v1) → while 按清单 invokeTool → shouldReplan → 最多 MAX_PLAN_VERSIONS=3 → plans[]。
 * 为什么单独成文件：对照右栏自己的请求只跑这一条。
 */

import { logger } from "../logger.js";
import { invokeTool, resetFailCounters } from "../tools/ops.js";
import type { ExecuteTrace, Observation, PlanVersion } from "../types.js";
import { doPlan } from "./parse-plan.js";
import { MAX_PLAN_VERSIONS, shouldReplan } from "./replan.js";

export async function runPlanAndExecute(task: string): Promise<{
  task: string;
  plans: PlanVersion[];
  plannerIterations: number;
  executeTrace: ExecuteTrace[];
  summary: { planCalls: number; executeCalls: number; firstActIndex: number };
  finalAnswer: string;
}> {
  const t0 = Date.now();
  resetFailCounters();
  logger.info(
    "调用循环-B-先规划",
    "调用循环开始：先规划再执行（变体 B · step-3 重规划 + 变体 E）",
    "为什么写这条日志：这条路径在第一次 Act 之前先吐一份「计划」对象；step-3 起执行阶段会检测是否触发重规划。当前：用户任务刚进来。",
    { 入参: { task }, __code: "const v1 = await doPlan(task, 1); ... while (curPlanIdx < curPlan.steps.length) { ... }" },
  );

  const v1 = await doPlan(task, 1);
  const plans: PlanVersion[] = [v1];

  logger.info(
    "调用循环-B-先规划",
    "调用循环开始：执行阶段（含可能重规划）",
    "为什么写这条日志：执行阶段本身可能循环；step-3 起每步执行后检测是否触发重规划。当前：v1 已就位。",
    { 入参: { initialPlanSteps: plans[0].steps.length }, __code: "while (curPlanIdx < curPlan.steps.length) { ... }" },
  );

  const observations: Observation[] = [];
  const executeTrace: ExecuteTrace[] = [];
  let curPlan = plans[plans.length - 1];
  let curPlanIdx = 0;

  while (curPlanIdx < curPlan.steps.length) {
    const step = curPlan.steps[curPlanIdx];
    const tStep0 = Date.now();
    logger.info(
      `││ 调用循环-B-先规划 [v${curPlan.version}]`,
      `调用循环开始：第 ${curPlanIdx + 1} 步 / 共 ${curPlan.steps.length} 步（v${curPlan.version}）`,
      "为什么写这条日志：执行阶段的每一步都按当前 plan 调；step-3 起执行后检测是否触发重规划。当前：执行第 N 步。",
      { 入参: { step, planVersion: curPlan.version }, __code: "const r = invokeTool({ tool: step.tool, args: step.args });" },
    );

    const r = invokeTool({ tool: step.tool, args: step.args });
    const trace: ExecuteTrace = { index: curPlanIdx + 1, step, result: r, costMs: Date.now() - tStep0, planVersion: curPlan.version };
    executeTrace.push(trace);
    observations.push({ tool: step.tool, args: step.args, result: r.result });

    logger.info(
      `││ 调用循环-B-先规划 [v${curPlan.version}]`,
      `调用循环结束：第 ${curPlanIdx + 1} 步`,
      "为什么写这条日志：收口当前步骤；下一步看是否触发重规划。",
      { 返回值: trace, 耗时ms: Date.now() - tStep0 },
    );

    const replan = shouldReplan(observations);
    if (replan.trigger && plans.length < MAX_PLAN_VERSIONS) {
      const newVersion = plans.length + 1;
      logger.info(
        "│ 调用函数-replan-detector",
        "调用函数：检测到重规划触发",
        `为什么写这条日志：执行阶段观察推翻原计划，必须换 plan。原因：${replan.reason}。当前：v${curPlan.version} 已作废，调用 planWithLlm 出 v${newVersion}；新 plan 版本从空 observations 开始。已用版本数 ${plans.length}/${MAX_PLAN_VERSIONS}。`,
        { reason: replan.reason, observations, v1WillBeObsoleted: curPlan.version },
      );
      const v = await doPlan(task, newVersion, observations, replan.reason);
      plans.push(v);
      curPlan = v;
      curPlanIdx = 0;
      observations.length = 0;
    } else if (replan.trigger) {
      logger.warn(
        "│ 调用函数-replan-detector",
        "调用函数：达到最大版本数，停止重规划",
        `为什么写这条日志：保险机制 —— 已达 MAX_PLAN_VERSIONS=${MAX_PLAN_VERSIONS}，即使满足重规划条件也不再调 planner，避免无限循环。`,
        { maxReached: MAX_PLAN_VERSIONS, wouldTriggerReason: replan.reason },
      );
      curPlanIdx++;
    } else {
      curPlanIdx++;
    }
  }

  logger.info(
    "调用循环-B-先规划",
    "调用循环结束：执行阶段",
    "为什么写这条日志：清单走完（或被替换走完）；下一步拼最终答案。",
    { 返回值: { executeCount: executeTrace.length, planVersions: plans.length }, 耗时ms: Date.now() - t0 },
  );

  const plannerIterations = plans.length;
  const finalAnswer = `上新流程完成 —— 计划迭代 ${plans.length} 版 / 共 ${executeTrace.length} 步执行 / 规划器调模型 ${plannerIterations} 次${plans.length > 1 ? `（v1 → v${plans.length} 重规划）` : ""}。`;
  logger.info(
    "调用循环-B-先规划",
    "调用循环结束：先规划再执行（变体 B · step-3 重规划）",
    "为什么写这条日志：跑完收口；下一步回给浏览器对照卡的右栏。",
    { 返回值: { planVersions: plans.length, executeCount: executeTrace.length, finalAnswer }, 耗时ms: Date.now() - t0 },
  );

  return {
    task,
    plans,
    plannerIterations,
    executeTrace,
    summary: { planCalls: plannerIterations, executeCalls: executeTrace.length, firstActIndex: 1 },
    finalAnswer,
  };
}
