/**
 * 切块工具函数：按 Markdown 二级标题 / 段落空行 / 句号切。
 *
 * 职责：本步核心 lib/flow/chunk.ts 的相邻辅助函数集合 —— 同目录相邻文件
 * （§5.3.8：核心里相邻的小步骤同文件或同目录相邻文件即可）。
 *
 * 数据流：lib/flow/chunk.ts → 本文件的 splitBy* 函数 → 切段数组（带 start/end 偏移）。
 *
 * 抽出原因：chunk.ts 主体超过 280 行上限（§5.3.8 行数硬约束）。
 */
import { logger } from "../logger.js";

/** 按 Markdown 二级标题切，保留标题作为下一段开头 */
export function splitByMarkdownH2(text: string): { text: string; start: number; end: number }[] {
  logger.debug(
    "││ 调用函数-splitByMarkdownH2",
    "调用函数开始：splitByMarkdownH2",
    "按 Markdown ## 二级标题切段；普通函数简写——函数体一句 + 五条日志含 __code。",
    { 入参: { textLen: text.length }, __code: "const out = splitByMarkdownH2(text);" },
  );
  const t0 = Date.now();
  const out: { text: string; start: number; end: number }[] = [];
  const lines = text.split("\n");
  let buf: string[] = [];
  let bufStart = 0;
  let cursor = 0;
  function flush(end: number) {
    out.push({ text: buf.join("\n"), start: bufStart, end });
    buf = [];
  }
  for (const line of lines) {
    if (line.startsWith("## ") && buf.length > 0) {
      flush(cursor);
      bufStart = cursor;
    }
    buf.push(line);
    cursor += line.length + 1; // +1 for \n
  }
  if (buf.length > 0) flush(cursor);
  logger.debug(
    "││ 调用函数-splitByMarkdownH2",
    "调用函数结束：splitByMarkdownH2",
    "已按 ## 切完。",
    { 返回值: { sections: out.length }, 耗时ms: Date.now() - t0 },
  );
  return out;
}

/** 按段落空行切（双换行） */
export function splitByBlankLine(text: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  const parts = text.split(/\n\s*\n/);
  let cursor = 0;
  for (const p of parts) {
    if (!p.trim()) {
      cursor += p.length + 2;
      continue;
    }
    out.push({ text: p, start: cursor, end: cursor + p.length });
    cursor += p.length + 2;
  }
  return out;
}

/** 按中英文句号切（保留标点） */
export function splitByPeriod(text: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = [];
  const re = /[^。！？!?\n]+[。！？!?]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!m[0].trim()) continue;
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}