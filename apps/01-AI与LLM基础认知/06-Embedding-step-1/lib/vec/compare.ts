/**
 * 职责：反例 / 正例两套对照计算，不碰 koa ctx。
 * 数据流：query 词 → Token ID 差值表，或按余弦排序的候选列表。
 */
import { logger } from "../logger.js";
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
  logger.info(
    "反例-TokenID差值",
    "为 query 生成 4 个词的 id 差值表",
    "反例：证明单纯按整数 id 相减没有语义；整张表打出来便于看差值毫无规律",
    { query, base, rows: WORDS.map((name) => ({ name, id: TOKEN_ID[name], delta: TOKEN_ID[name] - base })) },
  );
  return WORDS.map((name) => ({
    name,
    id: TOKEN_ID[name],
    delta: TOKEN_ID[name] - base,
  }));
}

export function rankByCosine(query: Word) {
  const q = EMBEDDING[query];
  logger.info(
    "正例-余弦排序-入口",
    "取查询向量，准备对候选词逐个算余弦",
    "正例入口：列出 query 向量 + 候选词数量，方便核对是否走全表",
    { query, queryVector: q, candidates: CANDIDATES, candidateCount: CANDIDATES.length },
  );
  const ranked = [...CANDIDATES]
    .map((name) => ({
      name,
      score: cosine(q, EMBEDDING[name]),
      vector: EMBEDDING[name],
    }))
    .sort((a, b) => b.score - a.score);
  logger.info(
    "正例-余弦排序-结果",
    "候选按余弦分数从高到低排好序",
    "正例出口：把排好序的整张表打出来，便于看谁分高（宠物→猫/狗 接近 1、→石头 接近 0）",
    { query, ranked, topScore: ranked[0]?.score, bottomScore: ranked[ranked.length - 1]?.score },
  );
  return ranked;
}

/** 故意拿零向量去撞闸门，让页面看见「算不了余弦」这类 400。 */
export function cosineAgainstZero(query: Word): number {
  const zero: Vec = [0, 0];
  logger.info(
    "正例-零向量撞闸门-入口",
    "故意拿零向量去算余弦，预期抛错",
    "正例对照：让页面看见「算不了余弦」路径 → HTTP 400；记下 query 与零向量便于复盘",
    { query, queryVector: EMBEDDING[query], zero },
  );
  return cosine(EMBEDDING[query], zero);
}
