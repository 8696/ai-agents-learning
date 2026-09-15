/**
 * 本步核心：把关第一刀——置信度阈值一道闸门。
 * 职责：拿 extractFacts 的候选清单，按 confidence 跟一个传入的阈值逐条比对，
 *       给出「通过 / 拦下」与拦下理由。
 * 数据流：candidates[] + threshold (0~1)
 *   → 逐条 confidence >= threshold 判 PASS
 *   → confidence < threshold 判 REJECT，原因为 BELOW_THRESHOLD
 *   → 返回 { threshold, passed[], rejected[], originalCount }，
 *     让上层（routes/filter.ts）把「通过 / 拦下」两堆原样交给页面。
 *
 * 为什么把这一刀单独抽成文件：写入策略八关里第 3 关「把关」有四道独立的判定（维度 A/B/C、
 * 置信度、敏感信息、人工确认），每一道都要单独看日志、单独换实现、单独测。把置信度这一刀
 * 单独成文件，后面再加维度 A/B/C / 敏感信息过滤 / 人工确认时，是在 lib/flow/ 里加新文件，
 * 不是改这个文件。
 */
import type { Candidate } from "./extract-facts.js";
import { logger } from "../logger.js";

export interface FilterVerdict {
  candidate: Candidate;
  passed: boolean;
  rejectReason?: string;
  confidence: number;
  threshold: number;
}

export interface FilterResult {
  threshold: number;
  /** 通过置信度阈值、能进库的候选（保持原顺序） */
  passed: FilterVerdict[];
  /** 没通过、被拦下的候选（保持原顺序） */
  rejected: FilterVerdict[];
  originalCount: number;
}

export function filterByConfidence(
  candidates: Candidate[],
  threshold: number,
): FilterResult {
  if (threshold < 0 || threshold > 1 || !Number.isFinite(threshold)) {
    throw new Error(`threshold 必须在 0~1 之间，实际收到：${threshold}`);
  }

  logger.info(
    "调用函数-filterByConfidence",
    "调用函数开始：filterByConfidence",
    "为什么写这条日志：第 3 关「把关」里置信度这一刀要单独看日志；后面再加深会把这一关拆掉换更好的实现，但入口签名不变。当前：拿到 extractFacts 的候选清单，准备逐条比对。",
    { 入参: { candidates, threshold }, __code: "const result = filterByConfidence(candidates, threshold);" },
  );

  const t0 = Date.now();
  const passed: FilterVerdict[] = [];
  const rejected: FilterVerdict[] = [];

  for (const c of candidates) {
    if (c.confidence >= threshold) {
      passed.push({ candidate: c, passed: true, confidence: c.confidence, threshold });
    } else {
      rejected.push({
        candidate: c,
        passed: false,
        rejectReason: "BELOW_THRESHOLD",
        confidence: c.confidence,
        threshold,
      });
    }
  }

  const result: FilterResult = {
    threshold,
    passed,
    rejected,
    originalCount: candidates.length,
  };

  logger.info(
    "调用函数-filterByConfidence",
    "调用函数结束：filterByConfidence",
    `为什么写这条日志：要让上层把「通过 / 拦下」两堆原样交给页面，页面上能看到具体的拦下理由。当前：判定完成，${passed.length} 条通过 / ${rejected.length} 条被拦下。`,
    { 返回值: result, 耗时ms: Date.now() - t0, 字段释义: {
      "passed[].passed": "true = 通过置信度阈值，能进库",
      "passed[].confidence": "模型返回的置信度",
      "rejected[].rejectReason": "BELOW_THRESHOLD = 低于阈值被拦下",
      "originalCount": "提取阶段抽出的总条数（不区分通过 / 拦下）",
    } },
  );

  return result;
}
