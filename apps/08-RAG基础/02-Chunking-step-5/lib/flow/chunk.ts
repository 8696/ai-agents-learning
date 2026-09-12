/**
 * 本步核心：把一段文本切成若干块。三种切法对照演示 step-1 教学点；
 * step-2 加 A · 单位对照 + B · 兜底截断（拆到 chunk-estimate.ts / chunk-fallback.ts）。
 *
 * 职责：纯文本操作，不调 LLM、不发网络请求。同一份文本进，三种切法各自返回块数组 + 统计。
 *
 * 数据流：routes/chunk-*.ts → Zod 校验 → 调用本文件对应函数 → 返回 {chunks, stats}。
 *
 * 相邻辅助文件（§5.3.8）：
 *   chunk-splitters.ts — 切段（按 ## / 段落 / 句号）
 *   chunk-estimate.ts  — 单位对照（字符 / 词元 / 汉字）
 *   chunk-fallback.ts  — 按字数切兜底（超长块按固定长度拆）
 */
import { logger } from "../logger.js";
import { splitByMarkdownH2 } from "./chunk-splitters.js";
import {
  approxTokens,
  approxTokensChinese,
  approxTokensEnglish,
} from "./chunk-estimate.js";
import { applyFallback } from "./chunk-fallback.js";
import { recurseByLevel } from "./chunk-recurse.js";

// ── 切块参数边界（防止 OOM / 死循环） ──
export const SIZE_MIN = 50;
export const SIZE_MAX = 5000;
export const OVERLAP_MIN = 0;
export const OVERLAP_MAX = 1000;
/** step-2 · B 件：单块超过这个字符数就走按字数切兜底（不依赖具体嵌入模型上限，本步先取保守值）。 */
export const MAX_CHUNK_BEFORE_FALLBACK = 2000;

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
  approxTokensChinese: number;
  approxTokensEnglish: number;
  startOffset: number;
  endOffset: number;
  overlapWithPrev: number;
  startsMidSentence: boolean;
  boundary: string;
  fallbackSplit: boolean;
  /** 章节标题（仅按结构切 / FAQ 切时有；fixed 切时无）。来自 Markdown ## 后的标题文字。 */
  section?: string;
};

export type ChunkStats = {
  total: number;
  totalChars: number;
  avgChars: number;
  maxChars: number;
  minChars: number;
  midSentenceCount: number;
  fallbackChunks: number;
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
      approxTokensChinese: approxTokensChinese(slice),
      approxTokensEnglish: approxTokensEnglish(slice),
      startOffset: i,
      endOffset: end,
      overlapWithPrev: idx === 0 ? 0 : overlap,
      startsMidSentence: startsMid,
      boundary: "fixed",
      fallbackSplit: false,
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
 * 按结构切（Structure-aware）—— step-5 · I 件：递归切分完整版，四级显式降级。
 *
 * 降级顺序：## → 段落 → 句号 → 按字数切兜底
 * 每块的 boundary 字段记录「实际在哪档被切」：
 *   - "##"           — 该段 ≤ MAX_CHUNK_BEFORE_FALLBACK 字符，按 ## 切
 *   - "段落"          — 按 ## 切后还超长，再按段落空行降级
 *   - "句号"          — 按段落还超长，再按中英文句号降级
 *   - "fallback-fixed" — 句号也压不住，按固定长度兜底（不再降级）
 *
 * 这是生产默认切法的显式化：先按结构（最好），再按结构降级（中），最后按字数切兜底（保底）。
 */
export function chunkByStructure(text: string): ChunkResult {
  logger.info(
    "│ 调用函数-chunkByStructure",
    "调用函数开始：chunkByStructure",
    "step-5 · I 件：递归切分完整版——## → 段落 → 句号 → 按字数切兜底 四级显式降级，每块 boundary 记录在哪档切。",
    { 入参: { textLen: text.length, maxBeforeFallback: MAX_CHUNK_BEFORE_FALLBACK }, __code: "const result = chunkByStructure(text);" },
  );
  const t0 = Date.now();
  if (!text) {
    return emptyResult("structure", {});
  }
  const idxRef = { v: 0 };
  const sections = splitByMarkdownH2(text);
  const chunks: Chunk[] = [];
  let offset = 0;
  for (const sec of sections) {
    if (!sec.text.trim()) {
      offset += sec.text.length;
      continue;
    }
    const section = extractSection(sec.text);
    chunks.push(...recurseByLevel(sec.text, offset + sec.start, idxRef, "##", section));
    offset += sec.text.length;
  }

  // ── 兜底截断：扫描所有块；超 MAX 的按固定长度再切，boundary="fallback-fixed" ──
  const { out: finalChunks, fallbackChunks } = applyFallback(chunks, MAX_CHUNK_BEFORE_FALLBACK, 0);
  const result = buildResult(finalChunks, "structure", { fallbackChunks });
  logger.info(
    "│ 调用函数-chunkByStructure",
    "调用函数结束：chunkByStructure",
    "已按结构切完 + 兜底处理完；各档降级次数在 stats 里。",
    {
      返回值: {
        total: result.stats.total,
        totalChars: result.stats.totalChars,
        fallbackChunks,
      },
      耗时ms: Date.now() - t0,
    },
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
    const section = extractSection(sec.text);
    chunks.push(makeChunk(idx++, sec.text, offset + sec.start, offset + sec.end, "faq-q", section));
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

/** 从 Markdown 文本里提取第一个 ## 标题后的文字（去掉前导 ## 与空格）。无 ## 标题则返回 undefined。 */
function extractSection(text: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/^##\s+(.+?)\s*$/m);
  return m ? m[1] : undefined;
}

export function makeChunk(index: number, text: string, start: number, end: number, boundary: string, section?: string): Chunk {
  const startsMid = start > 0 && !isSentenceBoundary(text[start - 1]);
  return {
    index,
    text,
    charCount: text.length,
    approxTokens: approxTokens(text),
    approxTokensChinese: approxTokensChinese(text),
    approxTokensEnglish: approxTokensEnglish(text),
    startOffset: start,
    endOffset: end,
    overlapWithPrev: 0,
    startsMidSentence: startsMid,
    boundary,
    fallbackSplit: false,
    section,
  };
}

function buildResult(chunks: Chunk[], algorithm: string, params: { size?: number; overlap?: number; fallbackChunks?: number }): ChunkResult {
  const charCounts = chunks.map(c => c.charCount);
  const totalChars = charCounts.reduce((a, b) => a + b, 0);
  const stats: ChunkStats = {
    total: chunks.length,
    totalChars,
    avgChars: chunks.length > 0 ? Math.round(totalChars / chunks.length) : 0,
    maxChars: charCounts.length > 0 ? Math.max(...charCounts) : 0,
    minChars: charCounts.length > 0 ? Math.min(...charCounts) : 0,
    midSentenceCount: chunks.filter(c => c.startsMidSentence).length,
    fallbackChunks: params.fallbackChunks ?? 0,
  };
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1];
    const cur = chunks[i];
    const overlap = Math.max(0, prev.endOffset - cur.startOffset);
    chunks[i] = { ...cur, overlapWithPrev: overlap };
  }
  return { chunks, stats, params: { ...params, algorithm } };
}

function emptyResult(algorithm: string, params: { size?: number; overlap?: number; fallbackChunks?: number }): ChunkResult {
  return {
    chunks: [],
    stats: {
      total: 0,
      totalChars: 0,
      avgChars: 0,
      maxChars: 0,
      minChars: 0,
      midSentenceCount: 0,
      fallbackChunks: params.fallbackChunks ?? 0,
    },
    params: { ...params, algorithm },
  };
}