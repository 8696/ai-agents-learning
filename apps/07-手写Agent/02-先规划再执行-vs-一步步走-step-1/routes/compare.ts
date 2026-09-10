/**
 * 职责：GET /api/compare —— 跑「一步步走 vs 先规划再执行」对照轨迹（mock 模型 + mock 工具）。
 * 数据流：浏览器 fetch GET /api/compare
 *   → 并行跑 runStepByStep + runPlanAndExecute
 *   → 每条轨迹的每一步都打五条日志（调用函数开始/结束 + 入参完整 + 返回值完整 + __code + 耗时）
 *   → 返回 { stepByStep, planAndExecute, comparison }：双栏轨迹 + 关键对照数字
 *
 * step-1 走 §5.3.0 例外「纯协议形状 / UI 渲染层演示」—— 不调真 LLM：
 *   - 「模型 Reason」这一跳用 mock（固定 tool_call 序列）
 *   - 「规划器」用 mock（固定 6 步清单）
 *   - 真实生产里这两次都是真调 LLM；step-2 加真规划器
 *
 * 任务：「春季上新：拉库存、给有货 SKU 写文案、通知运营」（变体 B 数据怎么走的同一句）
 *   - 走 mock 工具：query_stock(sku) / write_copy(sku, copy) / notify_ops(message)
 *   - mock 数据：SKU-88=12 件 / SKU-89=7 件 / SKU-90=0 件（0 库存演示跳写文案）
 *
 * 关键对照（页面要看清的差异）：
 *   - 模型调用次数：A 路径 = 圈数（每圈 Reason）；B 路径 = 1（只规划器）+ 0（执行不调模型）
 *   - 第一次 Act 前等待：A 短（首圈 Reason 完就 Act）；B 长（必须等规划结束）
 *   - 计划作为对象：A 无；B 有（在第一次 Act 之前已渲染到页上）
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { logger } from "../lib/logger.js";

// ── 类型 ──
type ToolCall = { tool: string; args: Record<string, unknown> };
type ToolResult = { tool: string; args: Record<string, unknown>; result: unknown; ok: boolean };
type Round = {
  index: number;
  reason: { tool_calls: ToolCall[]; thought: string };
  act: ToolResult[];
  costMs: number;
};
type PlanStep = { index: number; tool: string; args: Record<string, unknown>; reason: string };
type ExecuteTrace = {
  index: number;
  step: PlanStep;
  result: ToolResult;
  costMs: number;
};

// ── mock 工具（写死，演示形状）──
const STOCK: Record<string, number> = { "SKU-88": 12, "SKU-89": 7, "SKU-90": 0 };

function queryStock(sku: string): { sku: string; available: number } {
  return { sku, available: STOCK[sku] ?? 0 };
}

function writeCopy(sku: string, copy: string): { sku: string; copy: string; ok: true } {
  return { sku, copy, ok: true };
}

function notifyOps(message: string): { delivered: true; message: string } {
  return { delivered: true, message };
}

type ToolImpl = (args: Record<string, unknown>) => unknown;
const TOOL_IMPLS: Record<string, ToolImpl> = {
  query_stock: (a) => queryStock(String(a.sku)),
  write_copy: (a) => writeCopy(String(a.sku), String(a.copy)),
  notify_ops: (a) => notifyOps(String(a.message)),
};

function invokeTool(call: ToolCall): ToolResult {
  const impl = TOOL_IMPLS[call.tool];
  if (!impl) return { tool: call.tool, args: call.args, result: { error: "unknown tool" }, ok: false };
  try {
    return { tool: call.tool, args: call.args, result: impl(call.args), ok: true };
  } catch (e) {
    return { tool: call.tool, args: call.args, result: { error: String(e) }, ok: false };
  }
}

// ── 一步步走（变体 A · ReAct）──
async function runStepByStep(task: string): Promise<{
  task: string;
  trajectory: Round[];
  summary: { rounds: number; modelCalls: number; firstActIndex: number };
  finalAnswer: string;
}> {
  const t0 = Date.now();
  logger.info(
    "调用循环-A-一步步走",
    "调用循环开始：一步步走（变体 A · ReAct）",
    "为什么写这条日志：本路径是上一节 Agent Loop 同款「每圈 Reason 决定下一刻」，本条 demo 用来对照「先规划」的形状差异。当前：用户任务刚进来。",
    { 入参: { task }, __code: "const trajectory: Round[] = []; for (let i = 0; i < 7; i++) { ... }" },
  );

  // mock 模型固定轨迹：7 圈
  const MOCK_TURNS: Array<{ thought: string; calls: ToolCall[] }> = [
    { thought: "先查 SKU-88 库存", calls: [{ tool: "query_stock", args: { sku: "SKU-88" } }] },
    { thought: "再查 SKU-89", calls: [{ tool: "query_stock", args: { sku: "SKU-89" } }] },
    { thought: "查 SKU-90", calls: [{ tool: "query_stock", args: { sku: "SKU-90" } }] },
    { thought: "SKU-88 有货 12 件，写文案", calls: [{ tool: "write_copy", args: { sku: "SKU-88", copy: "春季新品 · 88 款 · 清新上市" } }] },
    { thought: "SKU-89 有货 7 件，写文案", calls: [{ tool: "write_copy", args: { sku: "SKU-89", copy: "春季新品 · 89 款 · 限量" } }] },
    { thought: "通知运营", calls: [{ tool: "notify_ops", args: { message: "上新：88/89 已写文案，90 缺货已记录" } }] },
    { thought: "汇总最终答案", calls: [] },
  ];

  const trajectory: Round[] = [];
  for (let i = 0; i < MOCK_TURNS.length; i++) {
    const tRound0 = Date.now();
    const turn = MOCK_TURNS[i];
    logger.info(
      "│ 调用循环-A-一步步走",
      `调用循环开始：第 ${i + 1} 圈 / 共 ${MOCK_TURNS.length} 圈`,
      "为什么写这条日志：一步步走每圈 Reason 后才决定这一刻调啥，不看未来。当前：第 N 圈 Reason 即将被模型（mock）回答。",
      { 入参: { round: i + 1 }, __code: `const turn = MOCK_TURNS[${i}];` },
    );

    // ── Act：每圈调工具 ──
    const act: ToolResult[] = [];
    for (const call of turn.calls) {
      const tAct0 = Date.now();
      logger.info(
        "││ 调用函数-invokeTool",
        "调用函数开始：invokeTool",
        "为什么写这条日志：模型已经明确说要这个工具，不调就进不了下一圈。当前：第 N 圈 Reason 后；下一步把 tool_result 塞回 messages（mock 这里直接累计到 trajectory）。",
        { 入参: { call }, __code: `const r = invokeTool(${JSON.stringify(call)});` },
      );
      const r = invokeTool(call);
      logger.info(
        "││ 调用函数-invokeTool",
        "调用函数结束：invokeTool",
        `为什么写这条日志：要把结果交给「模型」看下一步。当前：tool=${call.tool} ok=${r.ok}。`,
        { 返回值: r, 耗时ms: Date.now() - tAct0 },
      );
      act.push(r);
    }

    const round: Round = { index: i + 1, reason: { tool_calls: turn.calls, thought: turn.thought }, act, costMs: Date.now() - tRound0 };
    trajectory.push(round);

    logger.info(
      "│ 调用循环-A-一步步走",
      `调用循环结束：第 ${i + 1} 圈`,
      "为什么写这条日志：要把这一圈结果收口；下一步看 tool_calls 是不是空（最后一圈）→ 给最终答案。",
      { 返回值: { round }, 耗时ms: Date.now() - tRound0 },
    );
  }

  const finalAnswer = "上新完成：SKU-88（12 件）/ SKU-89（7 件）已写文案，SKU-90 缺货已记录，运营已通知。";
  logger.info(
    "调用循环-A-一步步走",
    "调用循环结束：一步步走（变体 A · ReAct）",
    "为什么写这条日志：跑完收口；下一步回给浏览器对照卡的左栏。",
    { 返回值: { rounds: trajectory.length, modelCalls: MOCK_TURNS.length, finalAnswer }, 耗时ms: Date.now() - t0 },
  );

  return {
    task,
    trajectory,
    summary: { rounds: trajectory.length, modelCalls: MOCK_TURNS.length, firstActIndex: 1 },
    finalAnswer,
  };
}

// ── 先规划再执行（变体 B）──
async function runPlanAndExecute(task: string): Promise<{
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
    "为什么写这条日志：这条路径在第一次 Act 之前先吐一份「计划」对象，让用户看见动手前清单；跟一步步走的关键差异就在这里。当前：用户任务刚进来。",
    { 入参: { task }, __code: "const plan = await planner(task);" },
  );

  // ── 规划器（mock：固定 6 步清单）──
  const tPlan0 = Date.now();
  logger.info(
    "│ 调用函数-planner",
    "调用函数开始：planner",
    "为什么写这条日志：这里是「先规划」的关键跳——模型一次性吐出完整清单。当前：task 进来；下一步把清单交执行器按顺序调。",
    { 入参: { task }, __code: "const plan = await callPlanner(task);" },
  );
  const plan: PlanStep[] = [
    { index: 1, tool: "query_stock", args: { sku: "SKU-88" }, reason: "查 SKU-88 库存" },
    { index: 2, tool: "query_stock", args: { sku: "SKU-89" }, reason: "查 SKU-89 库存" },
    { index: 3, tool: "query_stock", args: { sku: "SKU-90" }, reason: "查 SKU-90 库存" },
    { index: 4, tool: "write_copy",  args: { sku: "SKU-88", copy: "春季新品 · 88 款 · 清新上市" }, reason: "SKU-88 有货，写文案" },
    { index: 5, tool: "write_copy",  args: { sku: "SKU-89", copy: "春季新品 · 89 款 · 限量" }, reason: "SKU-89 有货，写文案" },
    { index: 6, tool: "notify_ops",  args: { message: "上新：88/89 已写文案，90 缺货已记录" }, reason: "通知运营" },
  ];
  logger.info(
    "│ 调用函数-planner",
    "调用函数结束：planner",
    "为什么写这条日志：计划作为对象存在；下一步才能「第一次 Act」。",
    { 返回值: plan, 耗时ms: Date.now() - tPlan0, 字段释义: { "plan[].tool": "要调的工具名", "plan[].args": "工具参数", "plan[].reason": "这一步为什么这么做" } },
  );

  // ── 执行器：按计划顺序调工具 ──
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
      { 入参: { step }, __code: `const r = invokeTool(step);` },
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
    "为什么写这条日志：跑完收口；下一步回给浏览器对照卡的右栏。",
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

export function mountCompareRoutes(router: Router): void {
  router.get("/api/compare", async (ctx: Context) => {
    const task = String(ctx.query.task ?? "春季上新：拉库存、给有货 SKU 写文案、通知运营");
    logger.info(
      "路由-compare",
      "调用函数开始：mountCompareRoutes.GET /api/compare",
      "为什么写这条日志：路由是 demo 的总入口；下一步并行跑两条轨迹。",
      { 入参: { task }, __code: "const [stepByStep, planAndExecute] = await Promise.all([runStepByStep(task), runPlanAndExecute(task)]);" },
    );

    const t0 = Date.now();
    const [stepByStep, planAndExecute] = await Promise.all([
      runStepByStep(task),
      runPlanAndExecute(task),
    ]);

    const comparison = {
      // 模型调用次数：A = 圈数（每圈 Reason 都调模型）；B = 1（规划器）+ 0（执行不调）
      modelCallsA: stepByStep.summary.modelCalls,
      modelCallsB: planAndExecute.summary.planCalls,
      // 第一次 Act 前的「等待」：A = 0（首圈 Reason 完立刻 Act）；B = 1（先规划）
      preActStepsA: 0,
      preActStepsB: 1,
      // 计划作为对象在第一次 Act 前存在：A = 否；B = 是
      planExistsBeforeFirstActA: false,
      planExistsBeforeFirstActB: true,
    };

    ctx.body = { task, stepByStep, planAndExecute, comparison };
    logger.info(
      "路由-compare",
      "调用函数结束：mountCompareRoutes.GET /api/compare",
      "为什么写这条日志：路由层收口；下一步前端按双栏渲染。",
      { 返回值: { task, modelCallsA: comparison.modelCallsA, modelCallsB: comparison.modelCallsB }, 耗时ms: Date.now() - t0 },
    );
  });
}
