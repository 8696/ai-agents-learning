/**
 * 职责：GET /api/compare —— 跑「一步步走 vs 先规划再执行」对照轨迹。
 *   - A 路径（一步步走）：**真模型循环** —— 每圈调 openai.chat.completions.create（协议 A · TOOLS_OPENAI）；最多 MAX_ROUNDS=8 圈；tool_calls 空 = 最终答案
 *   - B 路径（先规划再执行）：**真规划器 + 重规划** —— 第一次调 planWithLlm 吐 plan → 执行阶段每步后 shouldReplan 检测关键变化
 *     → 触发就再调 planWithLlm(task, observations) 出新版 plan → plan 切换
 *   - 解析失败时回退 mock plan + fallback=true（让前端可见「模型吐的东西不稳」）
 *
 * 数据流：浏览器 fetch GET /api/compare
 *   → 并行跑 runStepByStep + runPlanAndExecute
 *   → A 路径每圈真调模型 + 五条日志（messages + response + __code + 耗时）
 *   → B 路径真调规划器（可能多次）+ 执行阶段每步 invokeTool 五条日志
 *   → 返回 { task, stepByStep, planAndExecute: { plans, plannerIterations, ... }, comparison }
 *
 * step-3 = step-2 的完整复制 + B 路径加重规划（§5.3.14 增量构建）。
 * 关键对照（页面要看清的差异）：
 *   - 模型调用次数：A = 圈数；B = plannerIterations（可能 > 1）
 *   - 计划版本：plans[] 数组（v1 → v2 切换时前端能看见新旧清单）
 *   - executeTrace 每步带 planVersion（标这一步用的是哪一版 plan）
 *   - 重规划触发条件（默认）：所有 query_stock 库存都是 0
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm } from "../lib/http/runtime-ctx.js";
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

// ── step-5 变体 E：mock 工具强制失败（演示「工具失败 → 不重规划 → 按旧清单做错」）──
// 默认：write_copy 第 1 次调用强制失败；shouldReplan 不看 ok=false，所以不会触发重规划 → 演示「变体 E 过期仍执行」
const FAIL_ON_CALL: Record<string, number> = { "write_copy": 1 };
const callCounters: Record<string, number> = {};

function invokeTool(call: ToolCall): ToolResult {
  const toolName = call.tool;
  callCounters[toolName] = (callCounters[toolName] || 0) + 1;

  // 变体 E 强制失败
  if (FAIL_ON_CALL[toolName] && callCounters[toolName] === FAIL_ON_CALL[toolName]) {
    return {
      tool: toolName,
      args: call.args,
      result: { error: `mock 强制失败：${toolName} 第 ${callCounters[toolName]} 次调用（变体 E：工具失败 → shouldReplan 不看 ok=false → 不重规划 → 按旧清单继续做错）` },
      ok: false,
    };
  }

  const impl = TOOL_IMPLS[toolName];
  if (!impl) return { tool: toolName, args: call.args, result: { error: "unknown tool" }, ok: false };
  try {
    return { tool: toolName, args: call.args, result: impl(call.args), ok: true };
  } catch (e) {
    return { tool: toolName, args: call.args, result: { error: String(e) }, ok: false };
  }
}

// ── 一步步走（变体 A · ReAct · step-2 真模型）──
// tools（OpenAI 协议 A 格式）—— 三件套
const TOOLS_OPENAI = [
  { type: "function", function: { name: "query_stock", description: "查 SKU 库存。args: { sku }", parameters: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] } } },
  { type: "function", function: { name: "write_copy",  description: "给 SKU 写文案。args: { sku, copy }", parameters: { type: "object", properties: { sku: { type: "string" }, copy: { type: "string" } }, required: ["sku", "copy"] } } },
  { type: "function", function: { name: "notify_ops",  description: "通知运营。args: { message }", parameters: { type: "object", properties: { message: { type: "string" } }, required: ["message"] } } },
];

// system prompt：让模型按 ReAct 风格一步步来（不预先给完整计划）
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

const MAX_ROUNDS = 8;

async function runStepByStep(task: string): Promise<{
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

    // ──真调模型 ──
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
      // ── 最终答案 ──
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

    // ── 执行工具 ──
    const act: ToolResult[] = [];
    const thoughtCalls: ToolCall[] = [];
    for (const tc of toolCalls) {
      const tAct0 = Date.now();
      const callObj = {
        tool: tc.function.name,
        args: JSON.parse(tc.function.arguments || "{}"),
      };
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

// ── 工具参数名（位置参数 → 命名参数映射）──
const TOOL_PARAM_NAMES: Record<string, string[]> = {
  query_stock: ["sku"],
  write_copy: ["sku", "copy"],
  notify_ops: ["message"],
};

// ── 解析 args 字符串（支持带引号、不带引号；按位置映射到工具参数名）──
function parseArgs(tool: string, argsStr: string): Record<string, unknown> {
  const paramNames = TOOL_PARAM_NAMES[tool];
  if (!paramNames) return {};
  // 简易按逗号分隔（保留引号内的逗号）
  const parts: string[] = [];
  let buf = "";
  let inQuote: '"' | "'" | null = null;
  for (const ch of argsStr) {
    if (inQuote) {
      buf += ch;
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inQuote = ch; buf += ch; continue; }
    if (ch === ",") { parts.push(buf.trim()); buf = ""; continue; }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());
  const args: Record<string, unknown> = {};
  paramNames.forEach((name, i) => {
    const v = parts[i];
    if (v === undefined) return;
    const m = v.match(/^["'](.*)["']$/s);
    args[name] = m ? m[1] : v;
  });
  return args;
}

// ── 真规划器（step-3 重规划版）：调 openai.chat.completions.create（协议 A），模型吐自然语言步骤列表 ──
// 支持重规划：传 observations（之前执行的 tool_result 列表）让模型基于现场重出 plan
async function planWithLlm(
  task: string,
  observations: Array<{ tool: string; result: unknown }> = [],
): Promise<{ plan: PlanStep[]; rawText: string }> {
  const systemPrompt = [
    "你是一个规划器（planner）。",
    observations.length > 0
      ? `你之前已经执行过一些步骤，下面是观察结果：\n${observations.map(o => `  - ${o.tool}: ${JSON.stringify(o.result)}`).join("\n")}\n请基于这些观察重新规划接下来的步骤。`
      : "用户给你一句任务，请只按顺序输出步骤清单，不要解释别的。",
    "",
    "每行格式：步骤 N：tool_name(args) · 一句话理由",
    "可选工具（按位置传参）：",
    "- query_stock(sku) — 查库存；候选 SKU：SKU-88 / SKU-89 / SKU-90",
    "- write_copy(sku, copy) — 写文案",
    "- notify_ops(message) — 通知运营",
    "只输出步骤清单，不要别的文字。",
  ].join("\n");

  const request = {
    model: llm!.modelA,
    messages: [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: task },
      ...(observations.length > 0
        ? [{ role: "user" as const, content: `之前的观察（tool_result 累积）：${JSON.stringify(observations)}` }]
        : []),
    ],
  };

  const t0 = Date.now();
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么写这条日志：这是真发网络请求的那一次；B 路径的全部价值在这跳 —— 模型吐的清单就是「计划」对象。当前：在 planWithLlm 内，首次规划。",
    { 入参: request, __code: "const response = await llm!.openai.chat.completions.create(request);" },
  );
  const response = await llm!.openai.chat.completions.create(request);
  const rawText = response.choices[0]?.message?.content ?? "";
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型结束：对话补全",
    "为什么写这条日志：要解析模型吐的步骤列表成结构化 plan。当前：await 已返回；下一步先剥离 think 块，再按行解析。",
    { 返回值: response, 耗时ms: Date.now() - t0, 字段释义: { "choices[0].message.content": "自然语言步骤列表（可能含 <think>...</think> 思考块）" } },
  );

  // ── 剥离 <think>...</think> 块（模型的思考过程；不是最终输出）──
  const cleanedText = rawText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // ── 按行解析「步骤 N：tool(args) · 理由」──
  const lines = cleanedText.split("\n").map(l => l.trim()).filter(Boolean);
  const plan: PlanStep[] = [];
  for (const line of lines) {
    const m = line.match(/^步骤\s*(\d+)\s*[:：]\s*(\w+)\((.*?)\)\s*[·・]\s*(.+?)\s*$/);
    if (!m) continue;
    const [, num, tool, argsStr, reason] = m;
    const args = parseArgs(tool, argsStr);
    plan.push({ index: parseInt(num, 10), tool, args, reason });
  }
  return { plan, rawText };
}

// ── 兜底 mock plan（解析失败或 llm 未就绪时用）──
const FALLBACK_PLAN: PlanStep[] = [
  { index: 1, tool: "query_stock", args: { sku: "SKU-88" }, reason: "查 SKU-88 库存" },
  { index: 2, tool: "query_stock", args: { sku: "SKU-89" }, reason: "查 SKU-89 库存" },
  { index: 3, tool: "query_stock", args: { sku: "SKU-90" }, reason: "查 SKU-90 库存" },
  { index: 4, tool: "write_copy",  args: { sku: "SKU-88", copy: "春季新品 · 88 款 · 清新上市" }, reason: "SKU-88 有货，写文案" },
  { index: 5, tool: "write_copy",  args: { sku: "SKU-89", copy: "春季新品 · 89 款 · 限量" }, reason: "SKU-89 有货，写文案" },
  { index: 6, tool: "notify_ops",  args: { message: "上新：88/89 已写文案，90 缺货已记录" }, reason: "通知运营" },
];

// ── 重规划触发检测（变体 C · step-3）──
type Observation = { tool: string; args: Record<string, unknown>; result: unknown };

function shouldReplan(observations: Observation[]): { trigger: boolean; reason: string } {
  // 默认策略：query_stock 出现过 0 库存（缺货）→ 重规划
  const stockResults = observations
    .filter(o => o.tool === "query_stock")
    .map(o => ({
      sku: String((o.args as { sku?: string })?.sku ?? ""),
      available: (o.result as { available?: number })?.available,
    }));

  if (stockResults.length === 0) return { trigger: false, reason: "" };

  const zeroSkus = stockResults.filter(s => s.available === 0);
  if (zeroSkus.length > 0) {
    return {
      trigger: true,
      reason: `查询到 ${zeroSkus.length} 个 SKU 库存为 0（${zeroSkus.map(s => s.sku).join(", ")}）—— 原计划「写文案 + 通知」假设所有 SKU 有货，需要重规划`,
    };
  }

  return { trigger: false, reason: "" };
}

// ── 先规划再执行（变体 B · step-3 重规划）──
// ── 先规划再执行（变体 B · step-3 重规划）──
async function runPlanAndExecute(task: string): Promise<{
  task: string;
  plans: Array<{ version: number; steps: PlanStep[]; rawText: string; fallback: boolean; reason?: string }>;
  plannerIterations: number;
  executeTrace: Array<ExecuteTrace & { planVersion: number }>;
  summary: { planCalls: number; executeCalls: number; firstActIndex: number };
  finalAnswer: string;
}> {
  const t0 = Date.now();
  logger.info(
    "调用循环-B-先规划",
    "调用循环开始：先规划再执行（变体 B · step-3 重规划）",
    "为什么写这条日志：这条路径在第一次 Act 之前先吐一份「计划」对象；step-3 起执行阶段会检测是否触发重规划。当前：用户任务刚进来。",
    { 入参: { task }, __code: "const v1 = await doPlan(1); ... while (curPlanIdx < curPlan.steps.length) { ... }" },
  );

  // ── 抽 doPlan：调 planWithLlm + fallback 包装 ──
  async function doPlan(version: number, observations: Observation[] = [], reason?: string) {
    const tPlan0 = Date.now();
    logger.info(
      `│ 调用函数-planner-v${version}`,
      `调用函数开始：planner v${version}${observations.length > 0 ? "（重规划）" : ""}`,
      `为什么写这条日志：${observations.length > 0 ? `重规划触发原因：${reason}` : "首次规划 —— 真模型一次性吐完整清单"}。当前：task 进来；下一步把 plan 交执行器。`,
      { 入参: { task, observations, reason }, __code: "const { plan, rawText } = await planWithLlm(task, observations);" },
    );

    let steps: PlanStep[];
    let rawText = "";
    let fallback = false;
    if (llm) {
      const r = await planWithLlm(task, observations);
      if (r.plan.length > 0) {
        steps = r.plan;
        rawText = r.rawText;
        fallback = false;
      } else {
        steps = FALLBACK_PLAN;
        rawText = r.rawText;
        fallback = true;
        logger.warn(
          `│ 调用函数-planner-v${version}`,
          "调用函数：planner 解析失败，回退 mock plan",
          "为什么写这条日志：模型吐的文本没解析出任何「步骤 N：...」行。",
          { rawText },
        );
      }
    } else {
      steps = FALLBACK_PLAN;
      rawText = "(no LLM)";
      fallback = true;
    }
    logger.info(
      `│ 调用函数-planner-v${version}`,
      `调用函数结束：planner v${version}`,
      "为什么写这条日志：plan 已就位；下一步交执行器。",
      { 返回值: { steps, fallback, rawTextLen: rawText.length }, 耗时ms: Date.now() - tPlan0, 字段释义: { "plan[].tool": "要调的工具名", "plannerFallback": "true = 模型吐的没解析出来或缺 Key" } },
    );
    return { version, steps, rawText, fallback, reason };
  }

  // ── 第 1 版规划 ──
  const v1 = await doPlan(1);
  const plans: Array<{ version: number; steps: PlanStep[]; rawText: string; fallback: boolean; reason?: string }> = [v1];

  // ── 执行阶段：双层循环（外层 plan 版本；内层 plan 内的 step；每步后检测重规划）──
  logger.info(
    "调用循环-B-先规划",
    "调用循环开始：执行阶段（含可能重规划）",
    "为什么写这条日志：执行阶段本身可能循环；step-3 起每步执行后检测是否触发重规划。当前：v1 已就位。",
    { 入参: { initialPlanSteps: plans[0].steps.length }, __code: "while (curPlanIdx < curPlan.steps.length) { ... }" },
  );

  const observations: Observation[] = [];
  const executeTrace: Array<ExecuteTrace & { planVersion: number }> = [];

  let curPlan = plans[plans.length - 1];
  let curPlanIdx = 0;

  while (curPlanIdx < curPlan.steps.length) {
    const step = curPlan.steps[curPlanIdx];
    const tStep0 = Date.now();
    logger.info(
      `││ 调用循环-B-先规划 [v${curPlan.version}]`,
      `调用循环开始：第 ${curPlanIdx + 1} 步 / 共 ${curPlan.steps.length} 步（v${curPlan.version}）`,
      "为什么写这条日志：执行阶段的每一步都按当前 plan 调；step-3 起执行后检测是否触发重规划。当前：执行第 N 步。",
      { 入参: { step, planVersion: curPlan.version }, __code: `const r = invokeTool({ tool: step.tool, args: step.args });` },
    );

    const r = invokeTool({ tool: step.tool, args: step.args });
    const trace: ExecuteTrace & { planVersion: number } = { index: curPlanIdx + 1, step, result: r, costMs: Date.now() - tStep0, planVersion: curPlan.version };
    executeTrace.push(trace);
    observations.push({ tool: step.tool, args: step.args, result: r.result });

    logger.info(
      `││ 调用循环-B-先规划 [v${curPlan.version}]`,
      `调用循环结束：第 ${curPlanIdx + 1} 步`,
      "为什么写这条日志：收口当前步骤；下一步看是否触发重规划。",
      { 返回值: trace, 耗时ms: Date.now() - tStep0 },
    );

    // ── 检测重规划（带保险：plannerIterations 最多 3 版）──
    const MAX_PLAN_VERSIONS = 3;
    const replan = shouldReplan(observations);
    if (replan.trigger && plans.length < MAX_PLAN_VERSIONS) {
      const newVersion = plans.length + 1;
      logger.info(
        "│ 调用函数-replan-detector",
        "调用函数：检测到重规划触发",
        `为什么写这条日志：执行阶段观察推翻原计划，必须换 plan。原因：${replan.reason}。当前：v${curPlan.version} 已作废，调用 planWithLlm 出 v${newVersion}；新 plan 版本从空 observations 开始（不累积 v${curPlan.version} 的观察）。已用版本数 ${plans.length}/${MAX_PLAN_VERSIONS}。`,
        { reason: replan.reason, observations, v1WillBeObsoleted: curPlan.version },
      );
      const v = await doPlan(newVersion, observations, replan.reason);
      plans.push(v);
      curPlan = v;
      curPlanIdx = 0;
      observations.length = 0; // 新 plan 版本从 0 开始累积 observations（避免无限循环触发）
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

    // 变体 E：累计 executeTrace 里 result.ok === false 的次数（变体 E 触发条件）
    const toolFailures = planAndExecute.executeTrace.filter(s => s.result.ok === false).length;

    const comparison = {
      modelCallsA: stepByStep.summary.modelCalls,
      modelCallsB: planAndExecute.summary.planCalls,
      preActStepsA: 0,
      preActStepsB: 1,
      planExistsBeforeFirstActA: false,
      planExistsBeforeFirstActB: true,
      // step-3 增量
      replannerTriggered: planAndExecute.plannerIterations > 1,
      planVersions: planAndExecute.plannerIterations,
      // step-5 增量：变体 E「过期仍执行」
      toolFailures,
      variantETriggered: toolFailures > 0, // 工具失败 → 但 shouldReplan 不看 → 演示「按旧清单做错」
    };
    ctx.body = { task, stepByStep, planAndExecute, comparison };
    logger.info(
      "路由-compare",
      "调用函数结束：mountCompareRoutes.GET /api/compare",
      "为什么写这条日志：路由层收口；下一步前端按双栏渲染。",
      { 返回值: { task, modelCallsA: comparison.modelCallsA, modelCallsB: comparison.modelCallsB, replannerTriggered: comparison.replannerTriggered }, 耗时ms: Date.now() - t0 },
    );
  });
}
