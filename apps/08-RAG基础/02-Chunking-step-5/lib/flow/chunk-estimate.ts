/**
 * step-2 · A 件：单位对照辅助函数。
 *
 * 职责：从文本里分别按字符 / 词元 / 汉字三种数法估 token；同目录相邻文件（§5.3.8）。
 *
 * 数据流：lib/flow/chunk.ts → 本文件估算函数 → 各 Chunk 字段填值。
 */

/**
 * 混合估算（汉字 1.5 + 英文 1.3 + 其他 0.3）：step-1 默认值。
 */
export function approxTokens(text: string): number {
  if (!text) return 0;
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const englishWords = (text.match(/[A-Za-z0-9]+/g) || []).length;
  const otherChars = text.length - chineseChars - englishWords;
  return Math.round(chineseChars * 1.5 + englishWords * 1.3 + otherChars * 0.3);
}

/**
 * 按汉字 1 token / 字（中文密文档的有效估算；与英文教程的 512 数字直接对比时用）。
 */
export function approxTokensChinese(text: string): number {
  if (!text) return 0;
  return (text.match(/[一-鿿]/g) || []).length;
}

/**
 * 按英文词 1 token / 词（与英文教程 chunk_size=512 同源；中文环境下偏小）。
 */
export function approxTokensEnglish(text: string): number {
  if (!text) return 0;
  return (text.match(/[A-Za-z0-9]+/g) || []).length;
}