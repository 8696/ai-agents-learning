/**
 * 本步核心：第 4 关「去重」的第一步——变体 4-A 字面完全相同 → NOOP（什么都不做）。
 *
 * 职责：拿刚被用户点 [记住] 的候选，按 candidate.key 查事实库：
 *   · 库里有同 key + 同 value → 字面完全相同，NOOP（不重复写、不刷新 updated_at）
 *   · 库里有同 key + 不同 value → 字面不同，交给冲突处理（变体 5，留给后续 step）
 *   · 库里没有 → 全新事实，可以写
 *
 * 数据流：FilterVerdict（来自 confirm 路由）+ userId
 *   → 调 kvGet 查库 → 比对 value → 返回去重结果 { action, key, existingValue? }
 *
 * 为什么单独成文件：第 4 关「去重」是笔记独立写过的 4 种情况之一，
 * 后续会加 4-B（同 key 不同值交给冲突）、4-C（措辞不同意思一样嵌入相似度）、
 * 4-D（包含关系用更具体的替换更笼统的）——各自独立成文件，不改这一个。
 */
import { kvGet } from "../db.js";
import type { FilterVerdict } from "./filter-by-confidence.js";
import { logger } from "../logger.js";

export type DedupAction = "noop" | "new" | "conflict";

export interface DedupResult {
  action: DedupAction;
  key: string;
  existingValue?: unknown;
}

/** 提取已有事实的 value 字段；如果是裸值（不是业务 schema 包装的对象）就原样返回 */
function pickExistingValue(existing: unknown): unknown {
  if (existing !== null && typeof existing === "object" && "value" in (existing as Record<string, unknown>)) {
    return (existing as { value: unknown }).value;
  }
  return existing;
}

/** 把 candidate.value + existing.value 都用 JSON.stringify 规范化后再比对（处理 value 是对象 / 数组的情况） */
function valuesEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export async function dedupByKey(
  verdict: FilterVerdict,
  userId: string = "default",
): Promise<DedupResult> {
  const key = verdict.candidate.key;

  logger.info(
    "调用函数-dedupByKey",
    "调用函数开始：dedupByKey",
    "为什么写这条日志：变体 4-A 是去重 4 种情况里最简单的——按 candidate.key 查 kvGet，比对 value，决定是 NOOP / new / conflict。当前：拿到候选，准备按 key 查库。",
    { 入参: { key, candidateValue: verdict.candidate.value, candidateType: verdict.candidate.type }, __code: "const existing = await kvGet(userId, key);" },
  );

  const t0 = Date.now();
  const existing = await kvGet(userId, key);
  const existingValue = pickExistingValue(existing);

  let action: DedupAction;
  if (existing === undefined) {
    action = "new";
  } else if (valuesEqual(existingValue, verdict.candidate.value)) {
    action = "noop";
  } else {
    action = "conflict";
  }

  const result: DedupResult = { action, key, existingValue: existing };
  logger.info(
    "调用函数-dedupByKey",
    "调用函数结束：dedupByKey",
    `为什么写这条日志：要让 confirm 路由知道下一步该怎么走——noop 跳过 / new 调 kvSet 写 / conflict 抛给冲突处理（变体 5，留给后续 step）。当前：判定完成，action = ${action}。`,
    { 返回值: { action: result.action, key: result.key, hasExisting: existing !== undefined }, 耗时ms: Date.now() - t0, 字段释义: {
      "action": "noop = 字面完全相同（不重复写）/ new = 库里没有（可以写））/ conflict = 同 key 但 value 不同（变体 5，留给后续）",
      "    hasExisting": "true = 库里已有这条 key（不管是字面相同还是冲突）",
    } },
  );

  return result;
}