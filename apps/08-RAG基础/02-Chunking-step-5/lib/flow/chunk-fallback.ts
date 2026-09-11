/**
 * step-2 · B 件：兜底截断逻辑。
 *
 * 职责：把一块超长 Chunk 按固定长度再切为多个子 Chunk；不调嵌入模型、纯本地文本操作。
 *
 * 为什么单独成文件：chunk.ts 加完兜底逻辑后超 280 行（§5.3.8 行数硬约束），把这一段拆出来。
 *
 * 数据流：lib/flow/chunk.ts → fallbackSplitChunk(chunk) → Chunk[]。
 *
 * 切完后每块 boundary="fallback-fixed"、fallbackSplit=true，前端 ChunkCard 显示橙色徽标。
 */
import { logger } from "../logger.js";
import type { Chunk } from "./chunk.js";
import { isSentenceBoundary } from "./chunk.js";
import { approxTokens, approxTokensChinese, approxTokensEnglish } from "./chunk-estimate.js";

/**
 * 把一块超长 Chunk 按固定长度（threshold 字符）切为多个子 Chunk。
 * overlap = 0（兜底场景优先保证不超嵌入上限）。
 */
export function fallbackSplitChunk(chunk: Chunk, threshold: number, nextIndexRef: { v: number }): Chunk[] {
  const out: Chunk[] = [];
  let i = 0;
  while (i < chunk.text.length) {
    const end = Math.min(chunk.text.length, i + threshold);
    const sliceText = chunk.text.slice(i, end);
    const subStartsMid = i > 0 && !isSentenceBoundary(chunk.text[i - 1]);
    out.push({
      index: nextIndexRef.v++,
      text: sliceText,
      charCount: sliceText.length,
      approxTokens: approxTokens(sliceText),
      approxTokensChinese: approxTokensChinese(sliceText),
      approxTokensEnglish: approxTokensEnglish(sliceText),
      startOffset: chunk.startOffset + i,
      endOffset: chunk.startOffset + end,
      overlapWithPrev: 0,
      startsMidSentence: subStartsMid,
      boundary: "fallback-fixed",
      fallbackSplit: true,
    });
    i = end;
  }
  return out;
}

/**
 * 把 chunks 里所有超长的块用 fallbackSplitChunk 兜底；返回新数组 + 触发兜底的原始块数。
 */
export function applyFallback(chunks: Chunk[], threshold: number, idxStart: number): { out: Chunk[]; fallbackChunks: number } {
  logger.info(
    "││ 调用函数-applyFallback",
    "调用函数开始：applyFallback",
    "step-2 · B 件：扫一遍所有块，超 threshold 字符的按固定长度再切；记一下原始块数与切后总数。",
    { 入参: { totalChunks: chunks.length, threshold }, __code: "const {out, fallbackChunks} = applyFallback(chunks, 2000, idxStart);" },
  );
  const t0 = Date.now();
  const out: Chunk[] = [];
  const idxRef = { v: idxStart };
  let fallbackChunks = 0;
  for (const c of chunks) {
    if (c.charCount <= threshold) {
      // 重新分配 index 让最终序列连续
      out.push({ ...c, index: idxRef.v++ });
      continue;
    }
    fallbackChunks++;
    const sub = fallbackSplitChunk(c, threshold, idxRef);
    out.push(...sub);
  }
  logger.info(
    "││ 调用函数-applyFallback",
    "调用函数结束：applyFallback",
    "兜底处理完；触发兜底的原始块数已在结果里给出。",
    { 返回值: { totalOut: out.length, fallbackChunks }, 耗时ms: Date.now() - t0 },
  );
  return { out, fallbackChunks };
}