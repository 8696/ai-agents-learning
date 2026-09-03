/**
 * 职责：把一段文本切成 cl100k Token id 列表，并排出「字符数 vs Token 数」。
 * 数据流：string → gpt-tokenizer encode() → { text, charCount, tokenCount, previewIds }。
 * 为什么只返回前 5 个 id：本条要看见「Token 是代号」即可，整表刷满页面没有新信息。
 */
import { encode } from "gpt-tokenizer";
import { VOCAB_LABEL } from "./presets.js";

export type EncodeResult = {
  text: string;
  charCount: number;
  tokenCount: number;
  previewIds: number[];
  vocab: string;
};

export function encodeText(text: string): EncodeResult {
  // encode 返回 number[]，每个数字是词表里的一个 id。
  // length = Token 数 = 计费粒度；字符数并排放，才能看见「切碎」这件事。
  const tokenIds = encode(text);
  return {
    text,
    charCount: text.length,
    tokenCount: tokenIds.length,
    previewIds: tokenIds.slice(0, 5),
    vocab: VOCAB_LABEL,
  };
}
