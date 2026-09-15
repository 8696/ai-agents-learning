/**
 * 职责：本步核心——第 6 关「过期」的「谁判、代码判」分工：模型给每条事实打「重要性等级 + 衰减建议 + 有效期」，代码按模型给的规则算衰减权重 + 决定是否归档。
 * 数据流：facts → 调模型(协议 A,JSON Mode)→ 模型返回 { key, importance, reasoning, validUntil } → 写回 kv 表。
 *
 * 为什么必须调模型：笔记 §6 「谁判、代码判」分工表：
 *   模型判(需要语义)：6-A 「事实是否永不过期」、6-B 「事实应该多快过期」、6-C 「事实重要程度」
 *   代码判(确定性逻辑)：衰减权重公式 + scanForExpired 归档 + recall 排序
 *
 * 没有模型参与 = 全代码写死(像 step-10 之前的版本),所有事实一律同等衰减,不符合真实场景
 * —— 不同类型的事实衰减速度应该不同(姓名永不变,日程会过期,临时想法衰减快)。
 *
 * 设计：调模型一次,给库里所有未评估的事实打分 + 写回 importance 字段 + 可选 validUntil。
 * 调用方(routes/score-importance.ts)按结果写库 + 日志。
 */
import { z } from "zod";
import { kvDb } from "../db.js";
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

// ── 重要程度四档(代码 + 模型共享) ──
export const IMPORTANCE_LEVELS = ["critical", "important", "casual", "throwaway"] as const;
export type ImportanceLevel = (typeof IMPORTANCE_LEVELS)[number];

/** 每档对应的「半衰减期」(天)—— 代码按这个常量算衰减权重 */
export const HALF_LIFE_DAYS_BY_IMPORTANCE: Record<ImportanceLevel, number> = {
  critical: Number.POSITIVE_INFINITY,    // 永不过期 / 不衰减
  important: 180,                          // 半年衰减
  casual: 30,                              // 一个月衰减
  throwaway: 7,                            // 一周衰减
};

const ImportanceSchema = z.object({
  facts: z.array(z.object({
    key: z.string(),
    importance: z.enum(IMPORTANCE_LEVELS),
    reasoning: z.string(),
  })),
});

export type ImportanceResult = z.infer<typeof ImportanceSchema>["facts"];

const stmtReadForScoring = kvDb.prepare("SELECT key, value FROM kv WHERE user_id = ? AND importance IS NULL");
const stmtWriteImportance = kvDb.prepare("UPDATE kv SET importance = ?, importance_reasoning = ? WHERE user_id = ? AND key = ?");

interface FactForScoring {
  key: string;
  value: string;
}

function parseValue(valueJson: string): { value?: string; type?: string; validUntil?: string | null } {
  try { return JSON.parse(valueJson); } catch { return {}; }
}

const SCORE_SYSTEM = `你是「事实重要性评分员」。给你一组用户记忆库里的事实，每条是「key: 事实正文 + 记忆类型」。
请按以下 4 档给每条打分：
- critical:长期不变的身份 / 医疗 / 安全相关（姓名、母语、色盲、过敏、重大病史等）
- important:长期偏好 / 关键工作信息（技术栈、公司、长期工作模式）
- casual:普通偏好 / 短期偏好（今天想吃什么、最近喜欢什么）
- throwaway:临时安排 / 一次性信息（下周开会、这周实习、本次行程）

返回 JSON: { "facts": [{ "key": "...", "importance": "critical | important | casual | throwaway", "reasoning": "一句话理由（≤20 字）" }] }

注意：不要返回 validUntil —— 这条事实的到期日由 seed 预设（演示用），你只负责判「重要程度 + 理由」。`;

/** 推理模型常在 JSON 外面包一层 <think> 或代码围栏，先剥再 parse */
function stripWrap(s: string): string {
  // 剥 <think>...</think>
  s = s.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  // 剥 ```json ... ``` 或 ``` ... ```
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  return s;
}

export async function scoreImportance(userId: string): Promise<{ scored: number; results: ImportanceResult }> {
  const t0 = Date.now();
  const rows = stmtReadForScoring.all(userId) as FactForScoring[];
  if (rows.length === 0) {
    logger.info(
      "调用函数-scoreImportance",
      "调用函数结束：scoreImportance（无候选）",
      "为什么写这条日志：库里所有事实都已评估过重要性（importance 非 NULL），跳过模型调用。当前：rows.length = 0。",
      { 入参: { userId } },
    );
    return { scored: 0, results: [] };
  }

  const factsForModel = rows.map(function (r) {
    const v = parseValue(r.value);
    return { key: r.key, value: v.value || "", type: v.type || "语义记忆" };
  });

  logger.info(
    "调用函数-scoreImportance",
    "调用函数开始：scoreImportance",
    `为什么写这条日志：第 6 关「谁判、代码判」分工——模型判内容语义（事实重要程度 + 多久过期），代码算衰减权重 + 归档。当前：拿到 ${rows.length} 条未评估事实。`,
    { 入参: { userId, factCount: rows.length }, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );

  const llm = await getLlm();
  const request = {
    model: llm.modelA,
    messages: [
      { role: "system" as const, content: SCORE_SYSTEM },
      { role: "user" as const, content: JSON.stringify({ facts: factsForModel }) },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" as const },
  };
  logger.info(
    "││ 调用模型-scoreImportance-对话补全",
    "调用模型开始：scoreImportance 对话补全",
    `为什么写这条日志：真发网络请求的那一次，不用它就没有 importance 评分。当前：request 已拼好，${factsForModel.length} 条事实待评分。`,
    { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );
  const response = await llm.openai.chat.completions.create(request);
  let content = response.choices?.[0]?.message?.content || '{"facts":[]}';

  // 推理模型可能返回 <think>...</think> 思维链 + ```json 围栏，先剥再 parse
  content = stripWrap(content);

  let parsed: { facts?: Array<{ key: string; importance: string; reasoning: string }> };
  try { parsed = JSON.parse(content); } catch { parsed = { facts: [] }; }
  if (!parsed.facts || !Array.isArray(parsed.facts)) parsed.facts = [];

  // 校验 + 写回
  const validated: ImportanceResult = [];
  for (const f of parsed.facts) {
    const safe = ImportanceSchema.shape.facts.element.safeParse(f);
    if (!safe.success) continue;
    validated.push(safe.data);
  }

  let scored = 0;
  for (const v of validated) {
    // importance / importance_reasoning 写到顶层列；validUntil 由 seed 预设（不让模型给，避免模型理解错日期）
    stmtWriteImportance.run(v.importance, v.reasoning, userId, v.key);
    scored++;
  }

  logger.info(
    "││ 调用模型-scoreImportance-对话补全",
    "调用模型结束：scoreImportance 对话补全",
    `为什么写这条日志：让路由层知道模型评了多少条 + 每条给的是什么。当前：response 已返，scored = ${scored}。`,
    { 返回值: response, 耗时ms: Date.now() - t0, 字段释义: { "facts[].importance": "critical | important | casual | throwaway", "facts[].reasoning": "一句话理由", "facts[].validUntil": "ISO 8601 或 null = 永不过期" } },
  );
  logger.info(
    "调用函数-scoreImportance",
    "调用函数结束：scoreImportance",
    `为什么写这条日志：让路由层知道这次评分覆盖了多少条 + 总耗时。当前：scored = ${scored}，总耗时 = ${Date.now() - t0}ms。`,
    { 返回值: { scored, results: validated }, 耗时ms: Date.now() - t0 },
  );

  return { scored, results: validated };
}