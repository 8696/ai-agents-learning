/**
 * 职责：真规划器 —— 调模型吐步骤清单；短任务可解析 complete_todo，失败则按任务回退 mock。
 * 数据流：task + observations → openai.chat.completions.create → 剥思考块 → 正则解析 → plan[]。
 * 为什么单独成文件：解析规则和「按清单执行」正交。
 */

import { llm } from "../http/runtime-ctx.js";
import { logger } from "../logger.js";
import type { Observation, PlanStep } from "../types.js";

const TOOL_PARAM_NAMES: Record<string, string[]> = {
  query_stock: ["sku"],
  write_copy: ["sku", "copy"],
  notify_ops: ["message"],
  complete_todo: ["todo_id"],
};

export function parseArgs(tool: string, argsStr: string): Record<string, unknown> {
  const paramNames = TOOL_PARAM_NAMES[tool];
  if (!paramNames) return {};
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

export const FALLBACK_PLAN: PlanStep[] = [
  { index: 1, tool: "query_stock", args: { sku: "SKU-88" }, reason: "查 SKU-88 库存" },
  { index: 2, tool: "query_stock", args: { sku: "SKU-89" }, reason: "查 SKU-89 库存" },
  { index: 3, tool: "query_stock", args: { sku: "SKU-90" }, reason: "查 SKU-90 库存" },
  { index: 4, tool: "write_copy", args: { sku: "SKU-88", copy: "春季新品 · 88 款 · 清新上市" }, reason: "SKU-88 有货，写文案" },
  { index: 5, tool: "write_copy", args: { sku: "SKU-89", copy: "春季新品 · 89 款 · 限量" }, reason: "SKU-89 有货，写文案" },
  { index: 6, tool: "notify_ops", args: { message: "上新：88/89 已写文案，90 缺货已记录" }, reason: "通知运营" },
];

const SHORT_FALLBACK: PlanStep[] = [
  { index: 1, tool: "complete_todo", args: { todo_id: "todo-001" }, reason: "把待办标完成" },
];

export function fallbackPlanFor(task: string): PlanStep[] {
  return task.includes("todo-001") ? SHORT_FALLBACK : FALLBACK_PLAN;
}

export async function planWithLlm(
  task: string,
  observations: Array<{ tool: string; result: unknown }> = [],
): Promise<{ plan: PlanStep[]; rawText: string }> {
  const systemPrompt = [
    "你是一个规划器（planner）。",
    observations.length > 0
      ? `你之前已经执行过一些步骤，下面是观察结果：\n${observations.map((o) => `  - ${o.tool}: ${JSON.stringify(o.result)}`).join("\n")}\n请基于这些观察重新规划接下来的步骤。`
      : "用户给你一句任务，请只按顺序输出步骤清单，不要解释别的。",
    "",
    "每行格式：步骤 N：tool_name(args) · 一句话理由",
    "可选工具（按位置传参）：",
    "- query_stock(sku) — 查库存；候选 SKU：SKU-88 / SKU-89 / SKU-90",
    "- write_copy(sku, copy) — 写文案",
    "- notify_ops(message) — 通知运营",
    "- complete_todo(todo_id) — 把待办标完成",
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
    "为什么写这条日志：这是真发网络请求的那一次；B 路径的全部价值在这跳 —— 模型吐的清单就是「计划」对象。当前：在 planWithLlm 内。",
    { 入参: request, __code: "const response = await llm!.openai.chat.completions.create(request);" },
  );
  const response = await llm!.openai.chat.completions.create(request);
  const rawText = response.choices[0]?.message?.content ?? "";
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型结束：对话补全",
    "为什么写这条日志：要解析模型吐的步骤列表成结构化 plan。当前：await 已返回；下一步先剥离 think 块，再按行解析。",
    { 返回值: response, 耗时ms: Date.now() - t0, 字段释义: { "choices[0].message.content": "自然语言步骤列表（可能含思考块）" } },
  );

  const cleanedText = rawText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const lines = cleanedText.split("\n").map((l) => l.trim()).filter(Boolean);
  const plan: PlanStep[] = [];
  for (const line of lines) {
    const m = line.match(/^步骤\s*(\d+)\s*[:：]\s*(\w+)\((.*?)\)\s*[·・]\s*(.+?)\s*$/);
    if (!m) continue;
    const [, num, tool, argsStr, reason] = m;
    plan.push({ index: parseInt(num, 10), tool, args: parseArgs(tool, argsStr), reason });
  }
  return { plan, rawText };
}

export async function doPlan(
  task: string,
  version: number,
  observations: Observation[] = [],
  reason?: string,
): Promise<{ version: number; steps: PlanStep[]; rawText: string; fallback: boolean; reason?: string }> {
  const tPlan0 = Date.now();
  logger.info(
    `│ 调用函数-planner-v${version}`,
    `调用函数开始：planner v${version}${observations.length > 0 ? "（重规划）" : ""}`,
    `为什么写这条日志：${observations.length > 0 ? `重规划触发原因：${reason}` : "首次规划 —— 真模型一次性吐完整清单"}。当前：task 进来；下一步把 plan 交执行器。`,
    { 入参: { task, observations, reason }, __code: "const { plan, rawText } = await planWithLlm(task, observations);" },
  );

  const mock = fallbackPlanFor(task);
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
      steps = mock;
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
    steps = mock;
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
