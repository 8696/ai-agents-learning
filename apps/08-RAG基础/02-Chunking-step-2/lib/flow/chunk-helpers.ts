/**
 * step-2 主流程相邻辅助文件。
 *
 * 职责：装下 chunk.ts 拆出来的「类型 / 常量 / 纯函数小帮手」
 *   —— 类型 + 常量 + isSentenceBoundary + makeChunk + extractSection + buildResult + emptyResult。
 *
 * 数据流：lib/flow/chunk.ts → 本文件类型 + 工具函数 → Chunk[] / ChunkResult / OverlapCompareResult。
 *
 * 抽出原因：chunk.ts 加完 step-2 业务后超 280 行（§5.3.8 行数硬约束），把不直接参与「切块主循环」的部分拆出来。
 * 留 chunk.ts 只装四个主切法（chunkByFixed / chunkByStructure / chunkByFaq / compareOverlap）。
 */
import {
  approxTokens,
  approxTokensChinese,
  approxTokensEnglish,
} from "./chunk-estimate.js";

// ── 切块参数边界（防止 OOM / 死循环） ──
export const SIZE_MIN = 50;
export const SIZE_MAX = 5000;
export const OVERLAP_MIN = 0;
export const OVERLAP_MAX = 1000;
/** step-2 · B 件：单块超过这个字符数就走兜底再切（不依赖具体嵌入模型上限，本步先取保守值）。 */
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
  /** true = 文本前已拼了章节路径作为检索前缀（解决「该期限」类指代断裂；变体 15）。仅按结构切 + inheritHeader=true 时有。 */
  inheritedHeader?: boolean;
  /** 拼到 text 前面的章节前缀（用于前端展示「标题前缀」蓝字，让学习者看见拼了什么）。 */
  headerInheritText?: string;
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

export type OverlapCompareRow = {
  overlapPercent: number;
  overlap: number;
  chunks: Chunk[];
  stats: ChunkStats;
  embedCalls: number;
  libBloatPercent: number;
};

export type OverlapCompareResult = {
  size: number;
  rows: OverlapCompareRow[];
};

export function makeChunk(index: number, text: string, start: number, end: number, boundary: string, section?: string, inheritHeader?: boolean): Chunk {
  const startsMid = start > 0 && !isSentenceBoundary(text[start - 1]);
  const headerInheritText = inheritHeader && section ? `## ${section}\n` : undefined;
  const finalText = headerInheritText ? headerInheritText + text : text;
  return {
    index,
    text: finalText,
    charCount: finalText.length,
    approxTokens: approxTokens(finalText),
    approxTokensChinese: approxTokensChinese(finalText),
    approxTokensEnglish: approxTokensEnglish(finalText),
    startOffset: start,
    endOffset: end,
    overlapWithPrev: 0,
    startsMidSentence: startsMid,
    boundary,
    fallbackSplit: false,
    section,
    inheritedHeader: !!headerInheritText,
    headerInheritText,
  };
}

/** 从 Markdown 文本里提取第一个 ## 标题后的文字（去掉前导 ## 与空格）。无 ## 标题则返回 undefined。 */
export function extractSection(text: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/^##\s+(.+?)\s*$/m);
  return m ? m[1] : undefined;
}

export function buildResult(chunks: Chunk[], algorithm: string, params: { size?: number; overlap?: number; fallbackChunks?: number }): ChunkResult {
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

export function emptyResult(algorithm: string, params: { size?: number; overlap?: number; fallbackChunks?: number }): ChunkResult {
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