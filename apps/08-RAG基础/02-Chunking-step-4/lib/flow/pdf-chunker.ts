/**
 * step-4 · F 件 · PDF 按页切。
 *
 * 职责：用 pdf-parse 提取 PDF 文本，按 form feed (\f) 字符拆成每页一块，每块带 page 字段。
 * 跨页段落会被腰斩——这是 PDF 按页切的固有代价（变体 11）。
 *
 * 数据流：routes/chunk-pdf.ts → 本文件 chunkByPdf(buffer) → 返回 {chunks, stats}。
 *
 * 抽出原因：chunk.ts 加 PDF 解析会让它超出 280 行（§5.3.8 行数硬约束），PDF 是另一个职责（输入是 Buffer 不是 string）。
 */
import { logger } from "../logger.js";
import type { Chunk } from "./chunk.js";
import { approxTokens, approxTokensChinese, approxTokensEnglish } from "./chunk-estimate.js";

export type PdfChunkResult = {
  chunks: Chunk[];
  stats: {
    total: number;
    totalChars: number;
    avgChars: number;
    maxChars: number;
    minChars: number;
    midSentenceCount: number;
    fallbackChunks: number;
    pageCount: number;
  };
};

/**
 * 把 pdf-parse 输出的文本按 \f（form feed）拆成页数组。pdf-parse 默认就用 \f 分隔每页。
 */
export function splitPdfTextByFormFeed(text: string): string[] {
  return text.split("\f").filter(p => p.trim().length > 0);
}

/**
 * 把 PDF buffer 按页切。每页 = 1 个 Chunk，带 page 字段（1-indexed）。
 * boundary = "pdf-page"，让前端 ChunkCard 显示「页码」徽标。
 */
export function chunkByPdf(text: string): PdfChunkResult {
  logger.info(
    "│ 调用函数-chunkByPdf",
    "调用函数开始：chunkByPdf",
    "PDF 按页切：按 \\f 拆每页，每页 = 1 个 Chunk。跨页段落一定被腰斩——这是按页切的固有代价。",
    { 入参: { textLen: text.length }, __code: "const result = chunkByPdf(text);" },
  );
  const t0 = Date.now();
  const pages = splitPdfTextByFormFeed(text);
  const chunks: Chunk[] = [];
  for (let i = 0; i < pages.length; i++) {
    const pageText = pages[i];
    chunks.push({
      index: i,
      text: pageText,
      charCount: pageText.length,
      approxTokens: approxTokens(pageText),
      approxTokensChinese: approxTokensChinese(pageText),
      approxTokensEnglish: approxTokensEnglish(pageText),
      startOffset: 0,
      endOffset: pageText.length,
      overlapWithPrev: 0,
      startsMidSentence: false,
      boundary: "pdf-page",
      fallbackSplit: false,
    });
  }
  const charCounts = chunks.map(c => c.charCount);
  const totalChars = charCounts.reduce((a, b) => a + b, 0);
  const stats = {
    total: chunks.length,
    totalChars,
    avgChars: chunks.length > 0 ? Math.round(totalChars / chunks.length) : 0,
    maxChars: charCounts.length > 0 ? Math.max(...charCounts) : 0,
    minChars: charCounts.length > 0 ? Math.min(...charCounts) : 0,
    midSentenceCount: 0,
    fallbackChunks: 0,
    pageCount: pages.length,
  };
  logger.info(
    "│ 调用函数-chunkByPdf",
    "调用函数结束：chunkByPdf",
    "PDF 按页切完。",
    { 返回值: { pageCount: pages.length, totalChars, avgChars: stats.avgChars }, 耗时ms: Date.now() - t0 },
 );
  return { chunks, stats };
}