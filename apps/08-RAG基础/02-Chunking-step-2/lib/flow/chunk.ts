/**
 * 本步核心：把一段文本切成若干块。step-2 主流程 = 四个主切法对照。
 *   chunkByFixed / chunkByStructure / chunkByFaq / compareOverlap。
 *
 * 职责：纯文本操作，不调 LLM、不发网络请求。同一份文本进，主切法各自返回块数组 + 统计。
 *
 * 数据流：routes/chunk-*.ts → Zod 校验 → 调用本文件对应函数 → 返回 {chunks, stats}。
 *
 * 相邻辅助文件（§5.3.8）：
 *   chunk-splitters.ts — 切段（按 ## / 段落 / 句号）
 *   chunk-estimate.ts  — 单位对照（字符 / 词元 / 汉字）
 *   chunk-fallback.ts  — 兜底再切（超长块按固定长度拆）
 *   chunk-helpers.ts   — 类型 / 常量 / 工具函数（makeChunk / buildResult / emptyResult / extractSection）
 */
import { logger } from "../logger.js";
import {
  splitByMarkdownH2,
  splitByBlankLine,
  splitByPeriod,
} from "./chunk-splitters.js";
import {
  approxTokens,
  approxTokensChinese,
  approxTokensEnglish,
} from "./chunk-estimate.js";
import { applyFallback } from "./chunk-fallback.js";
import {
  buildResult,
  emptyResult,
  extractSection,
  isSentenceBoundary,
  makeChunk,
  MAX_CHUNK_BEFORE_FALLBACK,
} from "./chunk-helpers.js";
import type {
  Chunk,
  ChunkResult,
  OverlapCompareResult,
  OverlapCompareRow,
} from "./chunk-helpers.js";

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
 * 按结构切（Structure-aware）：按 Markdown 标题 / 段落空行 / 句号递归切；
 * 切完后走 step-2 · B 件的兜底——单块超 MAX_CHUNK_BEFORE_FALLBACK 字符的，按固定长度再切。
 *
 * inheritHeader=true 时，把每块的章节标题拼到块文本前（变体 15 标题继承）——同时 Chunk 标
 * `inheritedHeader=true` + `headerInheritText` 字段，前端 ChunkCard 显示蓝字「标题前缀」徽标。
 */
export function chunkByStructure(text: string, inheritHeader: boolean = false): ChunkResult {
  logger.info(
    "│ 调用函数-chunkByStructure",
    "调用函数开始：chunkByStructure",
    "按结构切：先按 ## 切，再按段落空行切，再按句号切；切完后用 applyFallback 兜底超长块。" +
      (inheritHeader ? " inheritHeader=true → 每块文本前拼章节标题（变体 15）。" : ""),
    { 入参: { textLen: text.length, maxBeforeFallback: MAX_CHUNK_BEFORE_FALLBACK, inheritHeader }, __code: "const result = chunkByStructure(text, inheritHeader);" },
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
    const section = extractSection(sec.text);
    if (sec.text.length > 800) {
      const paragraphs = splitByBlankLine(sec.text);
      for (const p of paragraphs) {
        if (!p.text.trim()) continue;
        if (p.text.length > 800) {
          const sentences = splitByPeriod(p.text);
          for (const s of sentences) {
            if (!s.text.trim()) continue;
            chunks.push(makeChunk(idx++, s.text, offset + s.start, offset + s.end, "句号", section, inheritHeader));
          }
        } else {
          chunks.push(makeChunk(idx++, p.text, offset + p.start, offset + p.end, "段落", section, inheritHeader));
        }
      }
    } else {
      chunks.push(makeChunk(idx++, sec.text, offset + sec.start, offset + sec.end, "##", section, inheritHeader));
    }
    offset += sec.text.length;
  }

  // ── step-2 · B 件：兜底截断 ──
  const { out: finalChunks, fallbackChunks } = applyFallback(chunks, MAX_CHUNK_BEFORE_FALLBACK, 0);
  const result = buildResult(finalChunks, "structure", { fallbackChunks });
  logger.info(
    "│ 调用函数-chunkByStructure",
    "调用函数结束：chunkByStructure",
    "已按结构切完 + 兜底处理完。" + (inheritHeader ? " 每块已拼章节前缀，inheritedHeader=true 块数=" + finalChunks.filter(c => c.inheritedHeader).length : ""),
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

/**
 * 需求 5：同一份文档 + 同一 size，分别按 overlap=0% / 10% / 30% 各跑一次 chunkByFixed，
 * 返回三组「块数 / 总字符 / 嵌入次数 / 库膨胀百分比」对照——学习者一眼看到 overlap 的代价。
 *
 * 库膨胀百分比 = (当前组块数 - overlap=0% 组块数) / overlap=0% 组块数 × 100
 * 嵌入次数 = 块总数（每块要调一次嵌入接口）
 */
export function compareOverlap(text: string, size: number): OverlapCompareResult {
  logger.info(
    "│ 调用函数-compareOverlap",
    "调用函数开始：compareOverlap",
    "需求 5：同一文档 + 同一 size，分别按 overlap=0/10/30% 各跑一次 chunkByFixed，对照块数 / 嵌入次数 / 库膨胀%。",
    { 入参: { textLen: text.length, size }, __code: "const result = compareOverlap(text, size);" },
  );
  const t0 = Date.now();
  const overlapPercents = [0, 10, 30];
  const baselineTotal = chunkByFixed(text, size, 0).stats.total || 1;
  const rows: OverlapCompareRow[] = overlapPercents.map((pct) => {
    const overlap = Math.max(0, Math.round((size * pct) / 100));
    const r = chunkByFixed(text, size, overlap);
    const libBloatPercent = Math.round(((r.stats.total - baselineTotal) / baselineTotal) * 100);
    return {
      overlapPercent: pct,
      overlap,
      chunks: r.chunks,
      stats: r.stats,
      embedCalls: r.stats.total,
      libBloatPercent,
    };
  });
  const result: OverlapCompareResult = { size, rows };
  logger.info(
    "│ 调用函数-compareOverlap",
    "调用函数结束：compareOverlap",
    "三组 overlap 对照跑完；每组的块数 / 嵌入次数 / 库膨胀% 在 rows 里。",
    {
      返回值: {
        size,
        rowSummaries: rows.map(function (r) { return { overlapPercent: r.overlapPercent, total: r.stats.total, embedCalls: r.embedCalls, libBloatPercent: r.libBloatPercent }; }),
      },
      耗时ms: Date.now() - t0,
    },
  );
  return result;
}