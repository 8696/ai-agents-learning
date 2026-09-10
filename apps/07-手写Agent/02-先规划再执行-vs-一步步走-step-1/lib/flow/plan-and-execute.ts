/**
 * 职责：先规划再执行（变体 B）—— mock 规划器一次吐 6 步清单，再按清单调工具。
 * 数据流：task → mock plan 对象（第一次 Act 之前就存在）→ 按步 invokeTool → executeTrace。
 * 为什么单独成文件：对照右栏自己的请求只跑这一条。
 */

import { logger } from "../logger.js";
import { invokeTool } from "../tools/ops.js";
import type { ExecuteTrace, PlanStep } from "../types.js";

export async function runPlanAndExecute(task: string): Promise<{
  task: string;
  plan: PlanStep[];
  executeTrace: ExecuteTrace[];
  summary: { planCalls: number; executeCalls: number; firstActIndex: number };
  finalAnswer: string;
}> {
  const t0 = Date.now();
  logger.info(
    "调用循环-B-先规划",
    "调用循环开始：先规划再执行（变体 B）",
    "为什么写这条日志：这条路径在第一次 Act 之前先吐一份「计划」对象。当前：用户任务刚进来。",
    { 入参: { task }, __code: "const plan = await planner(task);" },
  );

  const tPlan0 = Date.now();
  logger.info(
    "│ 调用函数-planner",
    "调用函数开始：planner",
    "为什么写这条日志：这里是「先规划」的关键跳——模型一次性吐出完整清单。当前：task 进来。",
    { 入参: { task }, __code: "const plan = await callPlanner(task);" },
  );
  const plan: PlanStep[] = [
    { index: 1, tool: "query_stock", args: { sku: "SKU-88" }, reason: "查 SKU-88 库存" },
    { index: 2, tool: "query_stock", args: { sku: "SKU-89" }, reason: "查 SKU-89 库存" },
    { index: 3, tool: "query_stock", args: { sku: "SKU-90" }, reason: "查 SKU-90 库存" },
    { index: 4, tool: "write_copy", args: { sku: "SKU-88", copy: "春季新品 · 88 款 · 清新上市" }, reason: "SKU-88 有货，写文案" },
    { index: 5, tool: "write_copy", args: { sku: "SKU-89", copy: "春季新品 · 89 款 · 限量" }, reason: "SKU-89 有货，写文案" },
    { index: 6, tool: "notify_ops", args: { message: "上新：88/89 已写文案，90 缺货已记录" }, reason: "通知运营" },
  ];
  logger.info(
    "│ 调用函数-planner",
    "调用函数结束：planner",
    "为什么写这条日志：计划作为对象存在；下一步才能「第一次 Act」。",
    {
      返回值: plan,
      耗时ms: Date.now() - tPlan0,
      字段释义: { "plan[].tool": "要调的工具名", "plan[].args": "工具参数", "plan[].reason": "这一步为什么这么做" },
    },
  );

  logger.info(
    "调用循环-B-先规划",
    "调用循环开始：执行阶段",
    "为什么写这条日志：执行阶段本身仍可能循环，但每一步不再问大模型「此刻调啥」。当前：plan 已就位。",
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
      { 入参: { step }, __code: "const r = invokeTool(step);" },
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
    "调用循环结束：先规划再执行（变体 B）",
    "为什么写这条日志：跑完收口；下一步回给浏览器右栏。",
    { 返回值: { planSteps: plan.length, executeCount: executeTrace.length, finalAnswer }, 耗时ms: Date.now() - t0 },
  );

  return {
    task,
    plan,
    executeTrace,
    summary: { planCalls: 1, executeCalls: executeTrace.length, firstActIndex: 1 },
    finalAnswer,
  };
}
