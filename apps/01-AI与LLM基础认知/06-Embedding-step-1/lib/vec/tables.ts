/**
 * 职责：玩具词表 —— Token ID（反例）和 2 维坐标（正例）必须成对出现。
 * 数据流：被 cosine / token-id 对照 / /health 读取。
 * 为什么 2 维：真 Embedding 768/1536 维人眼看不见远近；坐标是编的，不代表真模型。
 */
export const WORDS = ["宠物", "猫", "狗", "石头"] as const;
export type Word = (typeof WORDS)[number];

export const QUERY_DEFAULT: Word = "宠物";
export const CANDIDATES = ["猫", "狗", "石头"] as const;

/** 词表里的整数代号，和含义无关，相减没有任何意义。 */
export const TOKEN_ID: Record<Word, number> = {
  猫: 5001,
  狗: 3729,
  石头: 880,
  宠物: 2104,
};

export type Vec = readonly [number, number];

/** 刻意让「猫 / 狗 / 宠物」偏向 x 轴，「石头」偏向 y 轴。 */
export const EMBEDDING: Record<Word, Vec> = {
  猫: [0.95, 0.12],
  狗: [0.82, 0.35],
  石头: [0.12, 0.94],
  宠物: [0.9, 0.2],
};

export function isWord(value: string): value is Word {
  return (WORDS as readonly string[]).includes(value);
}
