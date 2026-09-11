/**
 * 职责：step-5 · I 件 · 递归切分核心函数。
 *
 * 数据流：lib/flow/chunk.ts → 本文件 recurseByLevel → Chunk[]。
 *
 * 四档显式降级：
 *   - 当前段 ≤ MAX_CHUNK_BEFORE_FALLBACK → 当前 boundary 直接收块
 *   - 当前段 > MAX → 降级到下一档（## → 段落 → 句号 → 兜底）
 *   - 句号档仍超 MAX → 直接打 fallback-fixed 标签给 applyFallback 二次切
 */
import { logger } from "../logger.js";
import {
  splitByBlankLine,
  splitByPeriod,
} from "./chunk-splitters.js";
import type { Chunk } from "./chunk.js";
import { makeChunk } from "./chunk.js";

const MAX = 2000;

/**
 * 递归切分核心：按当前文本长度判断该在哪档切。
 */
export function recurseByLevel(text: string, baseOffset: number, idxRef: { v: number }, boundary: string): Chunk[] {
  logger.debug(
    "││ 调用函数-recurseByLevel",
    "调用函数开始：recurseByLevel",
    "step-5 · I 件：递归切分核心；当前 boundary=" + boundary + "，text 长度=" + text.length,
    { 入参: { textLen: text.length, boundary }, __code: "const chunks = recurseByLevel(text, baseOffset, idxRef, boundary);" },
  );
  const t0 = Date.now();
  if (text.length <= MAX) {
    const out = [makeChunk(idxRef.v++, text, baseOffset, baseOffset + text.length, boundary)];
    logger.debug(
      "││ 调用函数-recurseByLevel",
      "调用函数结束：recurseByLevel",
      "已 ≤ MAX，直接收块。",
      { 返回值: { count: out.length }, 耗时ms: Date.now() - t0 },
    );
    return out;
  }
  if (boundary === "##") {
    // ## 切完后还超长 → 按段落空行降级
    const paragraphs = splitByBlankLine(text);
    const out: Chunk[] = [];
    let innerOffset = baseOffset;
    for (const p of paragraphs) {
      if (!p.text.trim()) {
        innerOffset += p.text.length;
        continue;
      }
      out.push(...recurseByLevel(p.text, innerOffset + p.start, idxRef, "段落"));
      innerOffset += p.text.length;
    }
    logger.debug(
      "││ 调用函数-recurseByLevel",
      "调用函数结束：recurseByLevel",
      "## 档降级到段落档。",
      { 返回值: { count: out.length }, 耗时ms: Date.now() - t0 },
    );
    return out;
  }
  if (boundary === "段落") {
    // 段落切完还超长 → 按中英文句号降级
    const sentences = splitByPeriod(text);
    const out: Chunk[] = [];
    let innerOffset = baseOffset;
    for (const s of sentences) {
      if (!s.text.trim()) {
        innerOffset += s.text.length;
        continue;
      }
      out.push(...recurseByLevel(s.text, innerOffset + s.start, idxRef, "句号"));
      innerOffset += s.text.length;
    }
    logger.debug(
      "││ 调用函数-recurseByLevel",
      "调用函数结束：recurseByLevel",
      "段落档降级到句号档。",
      { 返回值: { count: out.length }, 耗时ms: Date.now() - t0 },
    );
    return out;
  }
  // boundary === "句号"：句号都压不住 → 兜底硬切（applyFallback 会再走一遍）
  const out = [makeChunk(idxRef.v++, text, baseOffset, baseOffset + text.length, "fallback-fixed")];
  logger.debug(
    "││ 调用函数-recurseByLevel",
    "调用函数结束：recurseByLevel",
    "句号档仍超长，打 fallback-fixed 标记给 applyFallback。",
    { 返回值: { count: out.length }, 耗时ms: Date.now() - t0 },
  );
  return out;
}
