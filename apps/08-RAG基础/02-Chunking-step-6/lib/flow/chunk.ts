/**
 * 本步核心：把一段文本切成若干块。三种切法对照演示 step-1 教学点。
 *
 * 职责：纯文本操作，不调 LLM、不发网络请求。同一份文本进，三种切法各自返回块数组 + 统计。
 *
 * 为什么单独成文件：本条教学点就是「三种切法的差异」，学习者打开这一个文件就能把
 * size / overlap / 切法边界 / 块结构读完，route 只调不实现。
 *
 * 数据流：
 *   routes/chunk-{fixed,structure,faq}.ts
 *     → Zod 校验入参（{text, size, overlap} 或 {text}）
 *     → 调用本文件对应函数
 *     → 返回 {chunks, stats, params} 给页面
 *
 * 切段辅助函数（splitByMarkdownH2 / splitByBlankLine / splitByPeriod）抽到
 * 同目录相邻文件 chunk-splitters.ts（§5.3.8：核心里相邻小步骤同目录相邻文件）。
 *
 * 输出形状（统一）：
 *   chunk = {
 *     index, text, charCount, approxTokens,
 *     startOffset, endOffset, overlapWithPrev,
 *     startsMidSentence, boundary
 *   }
 */
import { logger } from "../logger.js";
import {
  splitByMarkdownH2,
  splitByBlankLine,
  splitByPeriod,
} from "./chunk-splitters.js";

// ── 切块参数边界（防止 OOM / 死循环） ──
export const SIZE_MIN = 50;
export const SIZE_MAX = 5000;
export const OVERLAP_MIN = 0;
export const OVERLAP_MAX = 1000;

/**
 * 中文 / 英文混合的粗略 token 估算：汉字按 1.5 token / 字符、英文按 1.3 token / 单词。
 * 不接 tokenizer 是因为 step-1 是 sketch，本条不调 LLM 也不引入本地 encode 依赖。
 */
export function approxTokens(text: string): number {
  if (!text) return 0;
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const englishWords = (text.match(/[A-Za-z0-9]+/g) || []).length;
  const otherChars = text.length - chineseChars - englishWords;
  return Math.round(chineseChars * 1.5 + englishWords * 1.3 + otherChars * 0.3);
}

/** 检测一个字符是句子终结符（句号 / 问号 / 感叹号 / 中文句号 / 段落结束） */
export function isSentenceBoundary(ch: string): boolean {
  if (!ch) return true;
  return /[。！？!?\n]/.test(ch);
}

export type Chunk = {
  index: number;
  text: string;
  charCount: number;
  approxTokens: number;
  startOffset: number;
  endOffset: number;
  overlapWithPrev: number;
  startsMidSentence: boolean;
  boundary: string;
};

export type ChunkStats = {
  total: number;
  totalChars: number;
  avgChars: number;
  maxChars: number;
  minChars: number;
  midSentenceCount: number;
};

export type ChunkResult = {
  chunks: Chunk[];
  stats: ChunkStats;
  params: { size?: number; overlap?: number; algorithm: string };
};

/**
 * 固定长度切（Fixed-size）：数够 N 个字就切，overlap 相邻共享。
 * 切口位置纯靠运气，overlap 是补救。
 */
export function chunkByFixed(text: string, size: number, overlap: number): ChunkResult {
  logger.info(
    "│ 调用函数-chunkByFixed",
    "调用函数开始：chunkByFixed",
    "固定长度切：数够 size 个字符就切一刀，overlap 与上一块共享尾部。本步核心对照之一。",
    { 入参: { textLen: text.length, size, overlap }, __code: "const result = chunkByFixed(text, size, overlap);" },
  );
  const t0 = Date.now();
  const chunks: Chunk[] = [];
  if (!text || size <= 0) {
    return emptyResult("fixed", { size, overlap });
  }
  const step = Math.max(1, size - overlap);
  for (let i = 0, idx = 0; i < text.length; i += step, idx++) {
    const end = Math.min(text.length, i + size);
    const slice = text.slice(i, end);
    const startsMid = i > 0 && !isSentenceBoundary(text[i - 1]);
    chunks.push({
      index: idx,
      text: slice,
      charCount: slice.length,
      approxTokens: approxTokens(slice),
      startOffset: i,
      endOffset: end,
      overlapWithPrev: idx === 0 ? 0 : overlap,
      startsMidSentence: startsMid,
      boundary: "fixed",
    });
    if (end >= text.length) break;
  }
  const result = buildResult(chunks, "fixed", { size, overlap });
  logger.info(
    "│ 调用函数-chunkByFixed",
    "调用函数结束：chunkByFixed",
    "已按固定长度切完；下一步 route 把结果写 ctx.body。",
    { 返回值: { total: result.stats.total, totalChars: result.stats.totalChars, midSentenceCount: result.stats.midSentenceCount }, 耗时ms: Date.now() - t0 },
  );
  return result;
}

/**
 * 按结构切（Structure-aware）：按 Markdown 标题 / 段落空行 / 句号递归切。
 * 这是生产里最常用的默认策略的简化版（不递归降级，只按 ## 与段落）。
 */
export function chunkByStructure(text: string): ChunkResult {
  logger.info(
    "│ 调用函数-chunkByStructure",
    "调用函数开始：chunkByStructure",
    "按结构切：先按 ## 切，再按段落空行切。切口落在语义边界上，块自洽。",
    { 入参: { textLen: text.length }, __code: "const result = chunkByStructure(text);" },
  );
  const t0 = Date.now();
  const chunks: Chunk[] = [];
  if (!text) {
    return emptyResult("structure", {});
  }
  const sections = splitByMarkdownH2(text);
  let offset = 0;
  let idx = 0;
  for (const sec of sections) {
    if (!sec.text.trim()) {
      offset += sec.text.length;
      continue;
    }
    if (sec.text.length > 800) {
      const paragraphs = splitByBlankLine(sec.text);
      for (const p of paragraphs) {
        if (!p.text.trim()) continue;
        if (p.text.length > 800) {
          const sentences = splitByPeriod(p.text);
          for (const s of sentences) {
            if (!s.text.trim()) continue;
            chunks.push(makeChunk(idx++, s.text, offset + s.start, offset + s.end, "句号"));
          }
        } else {
          chunks.push(makeChunk(idx++, p.text, offset + p.start, offset + p.end, "段落"));
        }
      }
    } else {
      chunks.push(makeChunk(idx++, sec.text, offset + sec.start, offset + sec.end, "##"));
    }
    offset += sec.text.length;
  }
  const result = buildResult(chunks, "structure", {});
  logger.info(
    "│ 调用函数-chunkByStructure",
    "调用函数结束：chunkByStructure",
    "已按结构切完。",
    { 返回值: { total: result.stats.total, totalChars: result.stats.totalChars }, 耗时ms: Date.now() - t0 },
  );
  return result;
}

/**
 * FAQ 切：按 ## 切，每块保留问句 + 答句，每块自洽，不需要 overlap。
 * 演示「重叠 = 0 合理」场景。
 */
export function chunkByFaq(text: string): ChunkResult {
  logger.info(
    "│ 调用函数-chunkByFaq",
    "调用函数开始：chunkByFaq",
    "FAQ 切：按 ## 切，一问一答一块，每块自洽，不需要 overlap。",
    { 入参: { textLen: text.length }, __code: "const result = chunkByFaq(text);" },
  );
  const t0 = Date.now();
  const chunks: Chunk[] = [];
  if (!text) {
    return emptyResult("faq", {});
  }
  const sections = splitByMarkdownH2(text);
  let offset = 0;
  let idx = 0;
  for (const sec of sections) {
    if (!sec.text.trim()) {
      offset += sec.text.length;
      continue;
    }
    chunks.push(makeChunk(idx++, sec.text, offset + sec.start, offset + sec.end, "faq-q"));
    offset += sec.text.length;
  }
  const result = buildResult(chunks, "faq", {});
  logger.info(
    "│ 调用函数-chunkByFaq",
    "调用函数结束：chunkByFaq",
    "FAQ 切完：每块自洽，所以 overlap = 0。",
    { 返回值: { total: result.stats.total, totalChars: result.stats.totalChars }, 耗时ms: Date.now() - t0 },
  );
  return result;
}

function makeChunk(index: number, text: string, start: number, end: number, boundary: string): Chunk {
  const startsMid = start > 0 && !isSentenceBoundary(text[start - 1]);
  return {
    index,
    text,
    charCount: text.length,
    approxTokens: approxTokens(text),
    startOffset: start,
    endOffset: end,
    overlapWithPrev: 0,
    startsMidSentence: startsMid,
    boundary,
  };
}

function buildResult(chunks: Chunk[], algorithm: string, params: { size?: number; overlap?: number }): ChunkResult {
  const charCounts = chunks.map(c => c.charCount);
  const totalChars = charCounts.reduce((a, b) => a + b, 0);
  const stats: ChunkStats = {
    total: chunks.length,
    totalChars,
    avgChars: chunks.length > 0 ? Math.round(totalChars / chunks.length) : 0,
    maxChars: charCounts.length > 0 ? Math.max(...charCounts) : 0,
    minChars: charCounts.length > 0 ? Math.min(...charCounts) : 0,
    midSentenceCount: chunks.filter(c => c.startsMidSentence).length,
  };
  // 修正 overlapWithPrev 的真实值：相邻块在原文里的字符级重叠
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1];
    const cur = chunks[i];
    const overlap = Math.max(0, prev.endOffset - cur.startOffset);
    chunks[i] = { ...cur, overlapWithPrev: overlap };
  }
  return { chunks, stats, params: { ...params, algorithm } };
}

function emptyResult(algorithm: string, params: { size?: number; overlap?: number }): ChunkResult {
  return {
    chunks: [],
    stats: { total: 0, totalChars: 0, avgChars: 0, maxChars: 0, minChars: 0, midSentenceCount: 0 },
    params: { ...params, algorithm },
  };
}