/**
 * 职责：只执行已保存的计划（含重规划）。禁止再跑一步步走。
 * 数据流：已保存的 v1 steps → while invokeTool → shouldReplan → plans[] + executeTrace。
 * 为什么单独成文件：确认后才进这里；没点确认 = 本文件不会被调用。
 */

import { logger } from "../logger.js";
import { invokeTool, resetFailCounters } from "../tools/ops.js";
import type { ExecuteTrace, Observation, PlanStep, PlanVersion } from "../types.js";
import { doPlan } from "./parse-plan.js";
import { MAX_PLAN_VERSIONS, shouldReplan } from "./replan.js";

export async function executeFromPlan(
  task: string,
  initialSteps: PlanStep[],
  rawText: string,
  fallback: boolean,
): Promise<{
  plans: PlanVersion[];
  executeTrace: ExecuteTrace[];
  plannerIterations: number;
  finalAnswer: string;
}> {
  const t0 = Date.now();
  resetFailCounters();
  logger.info(
    "调用循环-B-先规划",
    "调用循环开始：执行已保存的计划（变体 F 阶段 2）",
    "为什么写这条日志：人已经点头；现在才 invokeTool。当前：从 session 拿出的 v1 开始。",
    { 入参: { task, stepCount: initialSteps.length }, __code: "while (curPlanIdx < curPlan.steps.length) { ... }" },
  );

  const plans: PlanVersion[] = [{ version: 1, steps: initialSteps, rawText, fallback }];
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
      "为什么写这条日志：确认后才按清单调工具。当前：执行第 N 步。",
      { 入参: { step, planVersion: curPlan.version }, __code: "const r = invokeTool({ tool: step.tool, args: step.args });" },
    );

    logger.info(
      "│││ 调用函数-invokeTool",
      "调用函数开始：invokeTool",
      "为什么写这条日志：人点头了才调工具；没点确认这条日志不会出现。",
      { 入参: { call: { tool: step.tool, args: step.args } }, __code: "const r = invokeTool(step);" },
    );
    const r = invokeTool({ tool: step.tool, args: step.args });
    logger.info(
      "│││ 调用函数-invokeTool",
      "调用函数结束：invokeTool",
      `为什么写这条日志：收口当前工具。当前：tool=${step.tool} ok=${r.ok}。`,
      { 返回值: r, 耗时ms: Date.now() - tStep0 },
    );

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
        "调用函数：检测到重规划触发（step-6 同 step-3）",
        `为什么写这条日志：执行阶段观察推翻原计划。原因：${replan.reason}。`,
        { reason: replan.reason, observations },
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
        `为什么写这条日志：已达 MAX_PLAN_VERSIONS=${MAX_PLAN_VERSIONS}。`,
        { maxReached: MAX_PLAN_VERSIONS, wouldTriggerReason: replan.reason },
      );
      curPlanIdx++;
    } else {
      curPlanIdx++;
    }
  }

  const plannerIterations = plans.length;
  const finalAnswer = `上新流程完成 —— 计划迭代 ${plans.length} 版 / 共 ${executeTrace.length} 步执行 / 规划器调模型 ${plannerIterations} 次${plans.length > 1 ? `（v1 → v${plans.length} 重规划）` : ""}。`;
  logger.info(
    "调用循环-B-先规划",
    "调用循环结束：执行已保存的计划（变体 F 阶段 2）",
    "为什么写这条日志：清单走完；下一步回给浏览器右栏。",
    { 返回值: { planVersions: plans.length, executeCount: executeTrace.length, finalAnswer }, 耗时ms: Date.now() - t0 },
  );

  return { plans, executeTrace, plannerIterations, finalAnswer };
}
