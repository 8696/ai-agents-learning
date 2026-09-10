/**
 * 职责：真规划器 —— 调模型吐自然语言步骤，剥离 think 块，按行解析成 plan。
 * 数据流：task → openai.chat.completions.create → 剥 <think> → 正则解析 → plan[]；失败则交给调用方回退 mock。
 * 为什么单独成文件：解析规则和「按清单执行」正交；执行循环不该再抄一份 parseArgs。
 */

import { llm } from "../http/runtime-ctx.js";
import { logger } from "../logger.js";
import type { PlanStep } from "../types.js";

const TOOL_PARAM_NAMES: Record<string, string[]> = {
  query_stock: ["sku"],
  write_copy: ["sku", "copy"],
  notify_ops: ["message"],
};

/** 位置参数（可能带引号）→ 命名参数。保留引号内的逗号。 */
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

export async function planWithLlm(task: string): Promise<{ plan: PlanStep[]; rawText: string }> {
  const systemPrompt = [
    "你是一个规划器（planner）。",
    "用户给你一句任务，请只按顺序输出步骤清单，不要解释别的。",
    "每行格式：步骤 N：tool_name(args) · 一句话理由",
    "可选工具（按位置传参）：",
    "- query_stock(sku) — 查库存",
    "- write_copy(sku, copy) — 写文案",
    "- notify_ops(message) — 通知运营",
    "只输出步骤清单，不要别的文字。",
  ].join("\n");

  const request = {
    model: llm!.modelA,
    messages: [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: task },
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
    { 返回值: response, 耗时ms: Date.now() - t0, 字段释义: { "choices[0].message.content": "自然语言步骤列表（可能含思考块）" } },
  );

  // ① 先剥思考块，避免正则把思考过程当成步骤
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
