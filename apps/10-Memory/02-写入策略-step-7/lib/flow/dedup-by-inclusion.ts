/**
 * 本步核心：第 4 关「去重」的第四步——变体 4-D 包含关系 → 用更具体的替换更笼统的。
 *
 * 职责：拿新候选 (key, value) → 按 key 查事实库 → 比 value 的「粒度」（JSON 字符串长度）→
 *   新值显著更长 → action = "more_specific"（按变体 4-D 可考虑替换）；
 *   新值显著更短 → action = "less_specific"（不替换，避免库退化）；
 *   长度相近 → action = "unrelated"（不属于包含关系，留给变体 5 冲突判断）。
 *
 * 数据流：(key, value) + includeThreshold（粒度比，默认 1.2）
 *   → kvGet 按 key 查库
 *   → 没有 → action = "new"
 *   → 有 → 比 valueSize(newValue) vs valueSize(existingValue)
 *   → newSize >= existingSize * includeThreshold → more_specific
 *   → newSize <= existingSize / includeThreshold → less_specific
 *   → 否则 → unrelated
 *
 * 为什么单独成文件：4-D 是笔记 §4 写的 4 种去重情况之一（包含关系），
 *   跟 4-A（字面 key 比对）/ 4-B（同 key 不同值）/ 4-C（嵌入相似度）独立。
 *
 * 实现取舍：粒度用 valueSize = JSON.stringify(value).length 做近似。
 *   更严谨的判定要调模型「这条比那条信息量更大吗？」——那是笔记 §9「谁判」的
 *   模型建议 + 代码兜底那一套，本步先走纯本地代码。
 *
 * includeThreshold = 1.2：意思是「新值长度至少比旧值长 20% 才算更具体」——避免
 *   「Vue 3」 vs 「Vue 3.0」这种长度差 1 字符的伪包含关系误判。
 */
import { kvGet, kvSet } from "../db.js";
import { logger } from "../logger.js";

export type InclusionAction = "new" | "more_specific" | "less_specific" | "unrelated";

export interface DedupByInclusionResult {
  action: InclusionAction;
  includeThreshold: number;
  existingValue?: unknown;
  sizeRatio?: number; // newSize / existingSize
  /** true = 已调 kvSet 把 existing 替换为 new；false = 只判没写 */
  replaced?: boolean;
}

function pickExistingValue(existing: unknown): unknown {
  if (
    existing !== null &&
    typeof existing === "object" &&
    "value" in (existing as Record<string, unknown>)
  ) {
    return (existing as { value: unknown }).value;
  }
  return existing;
}

function valueSize(v: unknown): number {
  try {
    return JSON.stringify(v).length;
  } catch {
    return 0;
  }
}

export async function dedupByInclusion(
  key: string,
  value: unknown,
  includeThreshold: number = 1.2,
  replace: boolean = false,
  userId: string = "default",
): Promise<DedupByInclusionResult> {
  // ① includeThreshold 范围防御（必须 > 1）
  if (!Number.isFinite(includeThreshold) || includeThreshold <= 1) {
    throw new Error(`includeThreshold 必须 > 1；收到 ${includeThreshold}`);
  }

  logger.info(
    "调用函数-dedupByInclusion",
    "调用函数开始：dedupByInclusion",
    "为什么写这条日志：变体 4-D 是去重 4 种情况里最难理解的——新值比旧值长很多（信息量更大）才判更具体，新值更短则不替换（避免库退化）。当前：拿到 key + value + includeThreshold，准备按 key 查库。",
    {
      入参: { key, value, includeThreshold, userId },
      __code: "const existing = await kvGet(userId, key);",
    },
  );

  const t0 = Date.now();

  // ② 按 key 查库
  const existing = await kvGet(userId, key);
  if (existing === undefined) {
    const result: DedupByInclusionResult = { action: "new", includeThreshold };
    logger.info(
      "调用函数-dedupByInclusion",
      "调用函数结束：dedupByInclusion",
      "为什么写这条日志：库里没有这条 key → 直接判 new，可以写。当前：kvGet 返回 undefined。",
      { 返回值: result, 耗时ms: Date.now() - t0 },
    );
    return result;
  }

  // ③ 比粒度
  const existingValue = pickExistingValue(existing);
  const newSize = valueSize(value);
  const existingSize = valueSize(existingValue);
  const sizeRatio = existingSize === 0 ? Infinity : newSize / existingSize;

  let action: InclusionAction;
  if (sizeRatio >= includeThreshold) {
    action = "more_specific";
  } else if (sizeRatio <= 1 / includeThreshold) {
    action = "less_specific";
  } else {
    action = "unrelated";
  }

  let result: DedupByInclusionResult = {
    action,
    includeThreshold,
    existingValue: existing,
    sizeRatio,
  };

  // ③ 替换动作：仅 more_specific + 调用方勾了 replace → 调 kvSet 把 existing 替换为 new
  //    less_specific / unrelated / new 都不替换（4-D 的反向不替换 + 库不污染是核心）。
  if (replace && action === "more_specific") {
    logger.info(
      "│ 调用函数-dedupByInclusion",
      "替换：调 kvSet 把 existing 替换为 new",
      "为什么写这条日志：调用方勾了 replace + 判 more_specific 命中 → 调 kvSet 把同 key 的 value 替换为更具体的新值（4-D 的标准动作）。当前：准备写。",
      {
        入参: { key, newValue: value },
        __code: "await kvSet(userId, key, { value: typeof value === 'string' ? value : JSON.stringify(value), type: '语义记忆', confidence: 1.0, source: '4-D 包含关系替换（more_specific）', validUntil: null });",
      },
    );
    const replaceT0 = Date.now();
    await kvSet(userId, key, {
      value: typeof value === "string" ? value : JSON.stringify(value),
      type: "语义记忆",
      confidence: 1.0,
      source: "4-D 包含关系替换（more_specific）",
      validUntil: null,
    });
    result = { ...result, replaced: true };
    logger.info(
      "│ 调用函数-dedupByInclusion",
      "替换：kvSet 完成",
      "为什么写这条日志：要记下这次替换的目标 key + 耗时，方便排查「这条什么时候被替换」。当前：替换完成。",
      { 返回值: { key, replaced: true }, 耗时ms: Date.now() - replaceT0 },
    );
  }

  logger.info(
    "调用函数-dedupByInclusion",
    "调用函数结束：dedupByInclusion",
    `为什么写这条日志：要让路由知道下一步该怎么走——more_specific 按变体 4-D 可考虑替换 / less_specific 一定不替换（避免库退化）/ unrelated 不属于包含关系，留给变体 5。当前：判定完成，action = ${action}，sizeRatio = ${sizeRatio.toFixed(3)}。`,
    {
      返回值: {
        action: result.action,
        sizeRatio: result.sizeRatio,
        hasExisting: true,
      },
      耗时ms: Date.now() - t0,
      字段释义: {
        action: "more_specific = 新值信息量更大（按 4-D 可考虑替换）/ less_specific = 新值更笼统（不替换）/ unrelated = 长度相近但不是包含关系",
        sizeRatio: "newSize / existingSize；>= includeThreshold 算更具体，<= 1/includeThreshold 算更笼统",
      },
    },
  );

  return result;
}
