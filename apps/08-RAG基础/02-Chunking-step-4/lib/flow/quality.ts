/**
 * 职责：step-3 · A 件 · 模拟「怎么判断切得好不好」的 4 维度评估函数。
 *
 * 数据流：routes/compare-quality.ts → 本文件 evaluateQuality(chunks, query) → 返回
 * { midSentenceCount, purityScore, topKRepeatRate, mockTopScore } 给前端。
 *
 * 不调嵌入模型：「最高分」是模拟数字。讲清「同嵌入同问句才能比」这件事是教学点——
 * 真实分数需要嵌入 + 余弦相似度（模块 09 RAG 进阶会讲），本步只演示观察方法。
 *
 * 4 维度：
 *   midSentenceCount   命中卡片原文是半句话开头的块数（真实数）
 *   purityScore        块内容纯度（0~1）：unique 字符 / 总字符的粗略估计
 *   topKRepeatRate     前 K 条里相邻两块重叠字符 / 总字符
 *   mockTopScore       模拟最高分（0~1）：用上面几个指标 + 块大小方差合成的伪分数
 */
import { logger } from "../logger.js";
import type { Chunk } from "./chunk.js";

export type QualityReport = {
  midSentenceCount: number;
  totalChunks: number;
  purityScore: number;       // 0~1，越高越纯
  topKRepeatRate: number;   // 0~1，越高前 K 条越重复
  mockTopScore: number;     // 0~1 模拟分数，仅用于演示「同嵌入同问句才能比」
  avgChars: number;
  sizeStdDev: number;       // 块大小标准差（越大越不均）
};

export function evaluateQuality(chunks: Chunk[], topK: number): QualityReport {
  logger.info(
    "│ 调用函数-evaluateQuality",
    "调用函数开始：evaluateQuality",
    "step-3 · A 件：算 4 维度——半句话数 / 内容纯度 / 前 K 条重复度 / 模拟最高分。本地纯计算。",
    { 入参: { totalChunks: chunks.length, topK }, __code: "const report = evaluateQuality(chunks, topK);" },
 );
  const t0 = Date.now();
  const totalChunks = chunks.length;
  const midSentenceCount = chunks.filter(c => c.startsMidSentence).length;

  // ── 内容纯度：所有块的 union 字符 / 总字符 ──
  // 越纯 = 主题越集中 → unique 字符相对总字符应该偏低（高度复用核心词）
  // 不太直觉，但作为粗略估计：高纯度 = unique 字符占总字符比例 ≤ 0.5
  const allText = chunks.map(c => c.text).join("");
  const uniqueChars = new Set(allText).size;
  const purityScore = allText.length > 0 ? Math.min(1, uniqueChars / allText.length) : 0;

  // ── 前 K 条重复度：相邻两块 overlap 总和 / 前 K 条总字符 ──
  const topKChunks = chunks.slice(0, topK);
  const topKTotal = topKChunks.reduce((a, c) => a + c.charCount, 0);
  const topKOverlap = topKChunks.reduce((a, c) => a + (c.overlapWithPrev || 0), 0);
  const topKRepeatRate = topKTotal > 0 ? topKOverlap / topKTotal : 0;

  // ── 块大小标准差（块大小分布的均匀度）──
  const charCounts = chunks.map(c => c.charCount);
  const avgChars = charCounts.length > 0 ? charCounts.reduce((a, b) => a + b, 0) / charCounts.length : 0;
  const variance = charCounts.length > 0
    ? charCounts.reduce((a, b) => a + Math.pow(b - avgChars, 2), 0) / charCounts.length
    : 0;
  const sizeStdDev = Math.sqrt(variance);

  // ── 模拟最高分：用半句话率（越低越好）+ 重复度（越低越好）+ 块大小标准差（越小越好）合成 ──
  // 这是教学演示用的合成分数，不是真实嵌入分数。
  const midRate = totalChunks > 0 ? midSentenceCount / totalChunks : 0;
  const mockTopScore = Math.max(
    0,
    Math.min(
      1,
      0.5 - midRate * 0.3 - topKRepeatRate * 0.2 + Math.max(0, 0.2 - sizeStdDev / 1000),
    ),
  );

  const report: QualityReport = {
    midSentenceCount,
    totalChunks,
    purityScore,
    topKRepeatRate,
    mockTopScore,
    avgChars: Math.round(avgChars),
    sizeStdDev: Math.round(sizeStdDev),
  };
  logger.info(
    "│ 调用函数-evaluateQuality",
    "调用函数结束：evaluateQuality",
    "评估完成；下一步 route 把两份对比报告写 ctx.body。",
    { 返回值: report, 耗时ms: Date.now() - t0 },
 );
  return report;
}