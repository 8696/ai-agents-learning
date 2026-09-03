/**
 * 职责：反例 / 正例两套对照计算，不碰 koa ctx。
 * 数据流：query 词 → Token ID 差值表，或按余弦排序的候选列表。
 */
import { cosine } from "./cosine.js";
import {
  CANDIDATES,
  EMBEDDING,
  TOKEN_ID,
  WORDS,
  type Vec,
  type Word,
} from "./tables.js";

export function tokenIdDeltas(query: Word) {
  const base = TOKEN_ID[query];
  return WORDS.map((name) => ({
    name,
    id: TOKEN_ID[name],
    delta: TOKEN_ID[name] - base,
  }));
}

export function rankByCosine(query: Word) {
  const q = EMBEDDING[query];
  return [...CANDIDATES]
    .map((name) => ({
      name,
      score: cosine(q, EMBEDDING[name]),
      vector: EMBEDDING[name],
    }))
    .sort((a, b) => b.score - a.score);
}

/** 故意拿零向量去撞闸门，让页面看见「算不了余弦」这类 400。 */
export function cosineAgainstZero(query: Word): number {
  const zero: Vec = [0, 0];
  return cosine(EMBEDDING[query], zero);
}
