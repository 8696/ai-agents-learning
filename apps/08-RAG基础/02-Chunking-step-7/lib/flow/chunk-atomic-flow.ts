/**
 * step-7 · atomic 块保护版按结构切的实现。
 *
 * 职责：把识别出的 atomic 块作为「整块保留」插入到 chunkByStructure 结果里；
 * 普通区间走 chunkByStructure；超过兜底阈值（threshold）标 fallbackSplit=true + 给 overflowNote。
 *
 * 为什么单独成文件：与 extractAtomicBlocks 拆开，单文件不超过 280 行（§5.3.8）。
 *
 * 数据流：routes/chunk-atomic*.ts → 本文件 chunkByAtomic → extractAtomicBlocks（识别）+ chunkByStructure（普通区间）。
 */
import { logger } from "../logger.js";
import {
  chunkByStructure,
  approxTokens,
  type Chunk,
  type ChunkStats,
  type ChunkResult,
} from "./chunk.js";
import {
  extractAtomicBlocks,
  MAX_CHUNK_BEFORE_FALLBACK,
  type AtomicKind,
} from "./chunk-atomic.js";

export type AtomicChunkStats = ChunkStats & {
  atomicBlocks: number;
  atomicOverflow: number;
};

export type AtomicChunkResult = Omit<ChunkResult, "stats"> & {
  stats: AtomicChunkStats;
};

/**
 * step-7 · atomic 块保护版按结构切。
 * 算法：
 *   1. extractAtomicBlocks 找出所有表格 / 代码围栏 / 编号条款
 *   2. 把原文本切成「普通区间」+「atomic 块」交替
 *   3. 普通区间跑 chunkByStructure（含章节路径）
 *   4. atomic 块整体作为「整块保留」chunk；超过 threshold 标 fallbackSplit=true 并给 overflowNote
 *
 * threshold：atomic 块超过这个字符数就标 fallbackSplit=true；默认 MAX_CHUNK_BEFORE_FALLBACK=2000。
 */
export function chunkByAtomic(text: string, threshold: number = MAX_CHUNK_BEFORE_FALLBACK): AtomicChunkResult {
  logger.info(
    "│ 调用函数-chunkByAtomic",
    "调用函数开始：chunkByAtomic",
    "step-7 · atomic 块保护：先抽取表格 / 代码围栏 / 编号条款作为 atomic 整块；普通区间跑 chunkByStructure；超阈值给兜底说明。",
    { 入参: { textLen: text.length, threshold }, __code: "const result = chunkByAtomic(text, threshold);" },
  );
  const t0 = Date.now();
  if (!text) {
    return {
      chunks: [],
      stats: {
        total: 0,
        totalChars: 0,
        avgChars: 0,
        maxChars: 0,
        minChars: 0,
        midSentenceCount: 0,
        atomicBlocks: 0,
        atomicOverflow: 0,
      },
      params: { algorithm: "atomic", threshold },
    };
  }
  const blocks = extractAtomicBlocks(text);
  const chunks: Chunk[] = [];
  let cursor = 0;
  let idx = 0;

  for (const block of blocks) {
    // 区间 [cursor, block.start]：跑 chunkByStructure，再偏移回原文本坐标
    if (block.start > cursor) {
      const subText = text.slice(cursor, block.start);
      const subResult = chunkByStructure(subText);
      for (const c of subResult.chunks) {
        chunks.push({
          ...c,
          index: idx++,
          startOffset: cursor + c.startOffset,
          endOffset: cursor + c.endOffset,
        });
      }
    }
    // atomic 块：整块保留
    const overflow = block.text.length > threshold;
    chunks.push({
      index: idx++,
      text: block.text,
      charCount: block.text.length,
      approxTokens: approxTokens(block.text),
      startOffset: block.start,
      endOffset: block.end,
      overlapWithPrev: 0,
      startsMidSentence: false,
      boundary: "atomic-" + block.kind,
      fallbackSplit: overflow,
      atomicKind: block.kind as AtomicKind,
      overflowNote: overflow
        ? "atomic 块长 " + block.text.length + " 字符，超兜底阈值 " + threshold + "——按变体 14「宁可超过 size 上限也不切开」，整块保留；超嵌入上限时这里标 fallbackSplit=true 并附说明，由后续嵌入接口兜底（按行截断 / 单独处理 / 提示用户）"
        : undefined,
    });
    cursor = block.end;
  }
  // 区间 [cursor, text.length]：剩余按结构切
  if (cursor < text.length) {
    const subText = text.slice(cursor);
    const subResult = chunkByStructure(subText);
    for (const c of subResult.chunks) {
      chunks.push({
        ...c,
        index: idx++,
        startOffset: cursor + c.startOffset,
        endOffset: cursor + c.endOffset,
      });
    }
  }

  const atomicBlocks = chunks.filter(c => c.boundary && c.boundary.startsWith("atomic-")).length;
  const atomicOverflow = chunks.filter(c => c.fallbackSplit).length;
  // 修正 overlapWithPrev 的真实值：相邻块在原文里的字符级重叠
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1];
    const cur = chunks[i];
    const overlap = Math.max(0, prev.endOffset - cur.startOffset);
    chunks[i] = { ...cur, overlapWithPrev: overlap };
  }
  const totalChars = chunks.reduce((a, c) => a + c.charCount, 0);
  const charCounts = chunks.map(c => c.charCount);
  const result: AtomicChunkResult = {
    chunks,
    stats: {
      total: chunks.length,
      totalChars,
      avgChars: chunks.length > 0 ? Math.round(totalChars / chunks.length) : 0,
      maxChars: charCounts.length > 0 ? Math.max(...charCounts) : 0,
      minChars: charCounts.length > 0 ? Math.min(...charCounts) : 0,
      midSentenceCount: chunks.filter(c => c.startsMidSentence).length,
      atomicBlocks,
      atomicOverflow,
    },
    params: { algorithm: "atomic", threshold },
  };
  logger.info(
    "│ 调用函数-chunkByAtomic",
    "调用函数结束：chunkByAtomic",
    "atomic 保护版结构切完成；atomic 块数=" + atomicBlocks + "，超阈值块数=" + atomicOverflow,
    {
      返回值: {
        total: result.stats.total,
        totalChars: result.stats.totalChars,
        atomicBlocks,
        atomicOverflow,
      },
      耗时ms: Date.now() - t0,
    },
  );
  return result;
}