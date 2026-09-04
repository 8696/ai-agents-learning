/**
 * 职责：把一段文本切成 cl100k Token id 列表，并排出「字符数 vs Token 数」。
 * 数据流：string → gpt-tokenizer encode() → { text, charCount, tokenCount, previewIds }。
 * 为什么只返回前 5 个 id：本条要看见「Token 是代号」即可，整表刷满页面没有新信息。
 */
import { encode } from "gpt-tokenizer";
import { VOCAB_LABEL } from "./presets.js";
import { logger } from "../logger.js";

export type EncodeResult = {
  text: string;
  charCount: number;
  tokenCount: number;
  previewIds: number[];
  vocab: string;
};

export function encodeText(text: string): EncodeResult {
  logger.debug("tokenize.entry", "进入 encodeText", "调 gpt-tokenizer encode 前记输入规模；本地计算不消耗 LLM 额度", {
    textLen: text.length,
    preview: text.slice(0, 30),
  });
  // encode 返回 number[]，每个数字是词表里的一个 id。
  // length = Token 数 = 计费粒度；字符数并排放，才能看见「切碎」这件事。
  const tokenIds = encode(text);
  const result: EncodeResult = {
    text,
    charCount: text.length,
    tokenCount: tokenIds.length,
    previewIds: tokenIds.slice(0, 5),
    vocab: VOCAB_LABEL,
  };
  // 摘要：chars vs tokens 比 = 一段文字平均多少字 = 1 token（中文常见 1.5~2，英文 3~4）
  const ratio = text.length === 0 ? 0 : Number((text.length / tokenIds.length).toFixed(2));
  logger.info("tokenize.done", "encode 完成", "本地 cl100k 词表切完；记 chars vs tokens 比 + previewIds 便于复现 + 给「中英切碎差距」做证据", {
    charCount: result.charCount,
    tokenCount: result.tokenCount,
    charsPerToken: ratio,
    previewIds: result.previewIds,
    vocab: result.vocab,
  });
  return result;
}
