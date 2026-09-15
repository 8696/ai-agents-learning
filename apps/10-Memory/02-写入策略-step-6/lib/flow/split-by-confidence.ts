/**
 * 本步核心：第 3 关「把关」的最后一刀——人工确认（变体 3-D）。
 *
 * 职责：把过了所有维度的候选按 confidence 再分三档——
 *   · 高（conf >= highThreshold）：自动通过，能写进库（不打扰用户）
 *   · 中（midThreshold <= conf < highThreshold）：攒起来进「待确认」区，让用户点 [记住] / [不用]
 *   · 低（conf < midThreshold）：已被 step-2 置信度阈值拦下，不进这步
 *
 * 数据流：FilterVerdict[]（来自 filterByContentDimensions.verdicts，含维度判定结果；passed=true 才进）+ 阈值
 *   → 拆分 → { passed[], pending[] }
 *   → passed 进 passed[]；pending 进 pendingConfirmation[]，UI 单独展示
 *
 * 为什么单独成文件：变体 3-D 是把关这一关的第 5 把刀（与置信度 / 维度 A/B/C/PII 都正交），
 * 需要单独看日志、单独换实现、单独测。
 *
 * 三档分档是「过 / 等你确认 / 不过」三态判定，不是 step-2 那种「过 / 不过」二元判定：
 * 中档候选是「模型有把握但你可能不同意」的灰色地带——正是人工确认机制存在的理由。
 */
import { logger } from "../logger.js";
import type { FilterVerdict } from "./filter-by-confidence.js";

export interface SplitThresholds {
  highThreshold: number;
  midThreshold: number;
}

export interface SplitResult {
  /** 高档（conf >= highThreshold）：自动通过 */
  passed: FilterVerdict[];
  /** 中档（midThreshold <= conf < highThreshold）：攒进「待确认」区 */
  pending: FilterVerdict[];
}

function validateThresholds(t: SplitThresholds): void {
  if (!Number.isFinite(t.highThreshold) || t.highThreshold < 0 || t.highThreshold > 1) {
    throw new Error(`highThreshold 必须在 0~1 之间，实际收到：${t.highThreshold}`);
  }
  if (!Number.isFinite(t.midThreshold) || t.midThreshold < 0 || t.midThreshold > 1) {
    throw new Error(`midThreshold 必须在 0~1 之间，实际收到：${t.midThreshold}`);
  }
  if (t.midThreshold > t.highThreshold) {
    throw new Error(`midThreshold (${t.midThreshold}) 不能大于 highThreshold (${t.highThreshold})`);
  }
}

export function splitByConfidence(
  candidates: FilterVerdict[],
  thresholds: SplitThresholds,
): SplitResult {
  validateThresholds(thresholds);

  // 这一刀只对过所有维度的候选分档（维度没过 = 已 rejectReason 占位，不会被记成可写）
  const candidatesToSplit = candidates.filter((v) => v.passed);

  logger.info(
    "调用函数-splitByConfidence",
    "调用函数开始：splitByConfidence",
    `为什么写这条日志：变体 3-D 是把关第 5 把刀（与维度 A/B/C/PII 都正交），按 confidence 三档分档；分档后中档进 pendingConfirmation 由用户点 [记住] / [不用] 决定。当前：拿到 ${candidatesToSplit.length} 条已过维度的候选，准备按 highThreshold=${thresholds.highThreshold} / midThreshold=${thresholds.midThreshold} 分档。`,
    { 入参: { candidateCount: candidatesToSplit.length, thresholds }, __code: "const { passed, pending } = splitByConfidence(candidatesToSplit, thresholds);" },
  );

  const t0 = Date.now();
  const passed: FilterVerdict[] = [];
  const pending: FilterVerdict[] = [];

  for (const v of candidatesToSplit) {
    if (v.candidate.confidence >= thresholds.highThreshold) {
      passed.push(v);
    } else {
      // midThreshold <= conf < highThreshold（midThreshold 之下的已被 step-2 拦下）
      pending.push(v);
    }
  }

  const result: SplitResult = { passed, pending };

  logger.info(
    "调用函数-splitByConfidence",
    "调用函数结束：splitByConfidence",
    `为什么写这条日志：要把「高档自动通过」和「中档待确认」两堆原样交给页面，UI 上能看到哪些是直接通过、哪些等用户点 [记住] / [不用]。当前：分档完成，高档 ${passed.length} 条 / 中档 ${pending.length} 条。`,
    { 返回值: result, 耗时ms: Date.now() - t0, 字段释义: {
      "passed[].confidence": "模型给的置信度（>= highThreshold，自动通过）",
      "pending[].confidence": "模型给的置信度（midThreshold <= conf < highThreshold，等用户确认）",
      "highThreshold": "高档阈值；调它能看见同一条候选从「待确认」移到「自动通过」",
    } },
  );

  return result;
}

/** 给中档候选项生成一个稳定 id（用时间戳 + 索引 + key 的 hash 简化版），用于前端 [记住] / [不用] 调接口时定位 */
export function makePendingId(candidate: FilterVerdict, createdAt: number, idx: number): string {
  const hash = `${candidate.candidate.key}-${createdAt}-${idx}`;
  // 用 base64 编码避免特殊字符，但保持可读；实际工程用 UUID 库更稳
  return Buffer.from(hash).toString("base64").replace(/=+$/, "");
}