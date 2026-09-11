/**
 * step-7 · atomic 块保护识别 + 抽取核心。
 *
 * 职责：识别 Markdown 里哪些段属于「atomic 块」——表格 / 代码围栏 / 编号条款——
 * 并把它们整段抽出来，让外层 chunkByAtomic-flow 把这些段作为「整块保留」处理，不再切。
 *
 * 为什么单独成文件：
 *   - chunkByAtomic-flow 单独成文件，识别逻辑 + 块构造分两个文件，单文件不超过 280 行
 *   - 跨三种结构 + 维护「边界优先级」列表，集成在 chunk.ts 会超 280 行上限（§5.3.8）
 *
 * 数据流：lib/flow/chunk-atomic-flow.ts → 本文件 extractAtomicBlocks → AtomicBlock[]。
 *
 * 三种 atomic 块的识别规则（行级）：
 *   - 表格 (table)            — 行以 `|` 起始；连续多行 `|` 直到非 `|` 行结束
 *   - 代码围栏 (code)         — 行以 ``` ` 起始（开围栏），下一个 ``` ` 行（闭围栏）；成对
 *   - 编号条款 (numbered-clause) — 行匹配 `第[一二三四五六七八九十百千]+条`；直到下一个空行 / 标题 / 下一个编号条款
 *
 * 设计原则：
 *   - 宁可超过 size 上限也不切开（变体 14「不能腰斩的结构」）
 *   - 超过硬上限（嵌入模型输入上限）→ 标 `fallbackSplit=true` + 给出 overflowNote，不静默截断
 *   - 顺序：代码围栏 > 表格 > 编号条款（避免互相嵌套时误判）
 */

import { logger } from "../logger.js";

export type AtomicKind = "table" | "code" | "numbered-clause";

export type AtomicBlock = {
  /** atomic 块的原始文本（含换行） */
  text: string;
  /** atomic 块在原文中的字符偏移 [start, end) */
  start: number;
  end: number;
  kind: AtomicKind;
};

/** 单 atomic 块超过这个字符数（兜底阈值）就标 fallbackSplit=true 并给说明，不静默截断。默认 2000。 */
export const MAX_CHUNK_BEFORE_FALLBACK = 2000;

const NUMBERED_CLAUSE_RE = /^第[一二三四五六七八九十百千]+条/;
const TABLE_LINE_RE = /^\s*\|/;
const CODE_FENCE_RE = /^```/;

/**
 * 抽取一段文本里所有的 atomic 块；返回的 blocks 按在原文中的位置升序排列。
 *
 * 实现：逐行扫描；遇到 atomic 起始行就向后吞到结束行，记 start/end；普通行跳过。
 */
export function extractAtomicBlocks(text: string): AtomicBlock[] {
  logger.debug(
    "││ 调用函数-extractAtomicBlocks",
    "调用函数开始：extractAtomicBlocks",
    "step-7 · atomic 抽取：按行扫描，识别表格 / 代码围栏 / 编号条款三类 atomic 块。",
    { 入参: { textLen: text.length }, __code: "const blocks = extractAtomicBlocks(text);" },
  );
  const t0 = Date.now();
  if (!text) return [];
  const lines = text.split("\n");
  const blocks: AtomicBlock[] = [];
  let i = 0;
  let cursor = 0;

  while (i < lines.length) {
    const line = lines[i];
    const lineStart = cursor;
    const lineEnd = cursor + line.length;

    // 1. 代码围栏：``` 开 / ``` 闭 成对
    if (CODE_FENCE_RE.test(line)) {
      let j = i + 1;
      let blockEnd = lineEnd + 1; // +1 for \n
      while (j < lines.length && !CODE_FENCE_RE.test(lines[j])) {
        blockEnd += lines[j].length + 1;
        j++;
      }
      if (j < lines.length) {
        blockEnd += lines[j].length + 1;
        j++;
      }
      blocks.push({ text: text.slice(lineStart, blockEnd), start: lineStart, end: blockEnd, kind: "code" });
      i = j;
      cursor = blockEnd;
      continue;
    }

    // 2. 表格：连续 | 开头的行
    if (TABLE_LINE_RE.test(line)) {
      let j = i + 1;
      let blockEnd = lineEnd + 1;
      while (j < lines.length && TABLE_LINE_RE.test(lines[j])) {
        blockEnd += lines[j].length + 1;
        j++;
      }
      blocks.push({ text: text.slice(lineStart, blockEnd), start: lineStart, end: blockEnd, kind: "table" });
      i = j;
      cursor = blockEnd;
      continue;
    }

    // 3. 编号条款：「第 N 条」开头直到下一个空行 / 标题 / 下一个编号条款
    if (NUMBERED_CLAUSE_RE.test(line)) {
      let j = i + 1;
      let blockEnd = lineEnd + 1;
      while (j < lines.length) {
        const next = lines[j];
        if (!next.trim()) break; // 空行
        if (/^#+\s/.test(next)) break; // 标题
        if (NUMBERED_CLAUSE_RE.test(next)) break; // 下一条
        blockEnd += next.length + 1;
        j++;
      }
      blocks.push({ text: text.slice(lineStart, blockEnd), start: lineStart, end: blockEnd, kind: "numbered-clause" });
      i = j;
      cursor = blockEnd;
      continue;
    }

    // 普通行：跳过
    i++;
    cursor = lineEnd + 1;
  }
  logger.debug(
    "││ 调用函数-extractAtomicBlocks",
    "调用函数结束：extractAtomicBlocks",
    "atomic 抽取完成；按位置升序返回。",
    { 返回值: { count: blocks.length, kinds: blocks.map(function (b) { return b.kind; }) }, 耗时ms: Date.now() - t0 },
  );
  return blocks;
}

/** 给学习者用的三种 atomic 块的简短中文名（用于 ChunkCard 徽标）。 */
export function atomicKindLabel(kind: AtomicKind): string {
  switch (kind) {
    case "table": return "表格";
    case "code": return "代码围栏";
    case "numbered-clause": return "编号条款";
  }
}