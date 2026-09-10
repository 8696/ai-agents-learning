/**
 * 职责：把一段文本切成 cl100k Token id 列表，并排出「字符数 vs Token 数」。
 * 数据流：string → gpt-tokenizer encode() → { text, charCount, tokenCount, previewIds }。
 * 为什么只返回前 5 个 id：本条要看见「Token 是代号」即可，整表刷满页面没有新信息。
 *
 * 日志（§5.3.16）：本条不调 LLM、不发网络请求——主路径函数体逐步 + 教学相关字段释义；
 *   调用函数 五条日志（encodeText 封装层）+ 调用函数 五条日志（gpt-tokenizer encode 内部实现）。
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
  const tFuncStart = Date.now();
  logger.info(
    "│ 切词-encodeText",
    "调用函数开始：encodeText",
    "为什么写这条日志：route 只认这一层返回的 EncodeResult；里面那次才是「Token 化」真正干活的部分（看「调用函数开始：gpt-tokenizer.encode」）。当前：即将用 cl100k 词表切给定文本。",
    {
      入参: {
        textPreview: text.slice(0, 50),
        textLen: text.length,
        vocab: VOCAB_LABEL,
      },
      __code: `const tokenIds = encode(text);`,
    },
  );

  const t0 = Date.now();
  logger.info(
    "││ 切词实现-gpt-tokenizer.encode",
    "调用函数开始：gpt-tokenizer.encode",
    "为什么写这条日志：本地 cl100k 词表的真实现，不写就没法复现「切了多少 id」。当前：即将跑 gpt-tokenizer encode()。",
    {
      入参: {
        textLen: text.length,
        textPreview: text.slice(0, 50),
      },
      __code: `import { encode } from "gpt-tokenizer";\nconst tokenIds = encode(text);`,
    },
  );
  const tokenIds = encode(text);
  logger.info(
    "││ 切词实现-gpt-tokenizer.encode",
    "调用函数结束：gpt-tokenizer.encode",
    "为什么写这条日志：id 长度就是 Token 数 = 计费粒度；不写就丢了这一步真正干活的部分。当前：encode 已返回 number[]，下一步组装 EncodeResult。",
    {
      返回值: {
        tokenIdsLen: tokenIds.length,
        firstFive: tokenIds.slice(0, 5),
      },
      耗时ms: Date.now() - t0,
      字段释义: {
        tokenIdsLen: "Token 总数 = 计费粒度（不是字符数 / 词数）",
        firstFive: "前 5 个 id 是词表代号，页面只显示这些就够证明「Token 是 id」",
      },
    },
  );

  const result: EncodeResult = {
    text,
    charCount: text.length,
    tokenCount: tokenIds.length,
    previewIds: tokenIds.slice(0, 5),
    vocab: VOCAB_LABEL,
  };
  // 摘要：chars vs tokens 比 = 一段文字平均多少字 = 1 token（中文常见 1.5~2，英文 3~4）
  const ratio = text.length === 0 ? 0 : Number((text.length / tokenIds.length).toFixed(2));

  logger.info(
    "│ 切词-encodeText",
    "调用函数结束：encodeText",
    "为什么写这条日志：route 要把 EncodeResult 写进 ctx.body 交给页面 stats 区。当前：EncodeResult 已组装好（含 chars vs tokens 比）。",
    {
      返回值: {
        charCount: result.charCount,
        tokenCount: result.tokenCount,
        charsPerToken: ratio,
        previewIds: result.previewIds,
        vocab: result.vocab,
      },
      耗时ms: Date.now() - tFuncStart,
      字段释义: {
        charsPerToken: "一段文字平均多少字 = 1 token；中文 1.5~2，英文 3~4（这就是「中文更碎」）",
      },
    },
  );

  return result;
}