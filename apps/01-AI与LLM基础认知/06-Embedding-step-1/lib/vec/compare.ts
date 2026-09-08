/**
 * 职责：反例 / 正例两套对照计算，不碰 koa ctx。
 * 数据流：query 词 → Token ID 差值表，或按余弦排序的候选列表。
 *
 * 日志（§5.3.16）：调用函数 五件套（封装层），内部 cosine() 五件套由 cosine.ts 单独打。
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
  const t0 = Date.now();
  logger.info(
    "│ 反例-tokenIdDeltas",
    "调用函数开始：tokenIdDeltas",
    "为什么打：反例要证明「Token id 相减没有语义」——不打就丢了整张差值表。当前：即将按 WORDS 全表展开。",
    {
      入参: { query, base },
      __code: `const rows = WORDS.map(name => ({ name, id: TOKEN_ID[name], delta: TOKEN_ID[name] - base }));`,
    },
  );
  const rows = WORDS.map((name) => ({
    name,
    id: TOKEN_ID[name],
    delta: TOKEN_ID[name] - base,
  }));
  logger.info(
    "│ 反例-tokenIdDeltas",
    "调用函数结束：tokenIdDeltas",
    "为什么打：反例出口——整张差值表要能复盘，5001 和 3729 差多少说明不了猫和狗亲不亲。当前：rows 已拼好。",
    {
      返回值: { rowsCount: rows.length, rows },
      耗时ms: Date.now() - t0,
      字段释义: {
        delta: "id 差值，没有语义；这就是「反例」的物理证据",
      },
    },
  );
  return rows;
}

export function rankByCosine(query: Word) {
  const t0 = Date.now();
  const q = EMBEDDING[query];
  logger.info(
    "│ 正例-rankByCosine",
    "调用函数开始：rankByCosine",
    "为什么打：正例入口——列出 query 向量 + 候选词数量，方便核对是否走全表。当前：即将按 CANDIDATES 全表逐个算余弦。",
    {
      入参: { query, queryVector: q, candidates: CANDIDATES, candidateCount: CANDIDATES.length },
      __code: `const ranked = [...CANDIDATES].map(name => ({ name, score: cosine(q, EMBEDDING[name]), vector: EMBEDDING[name] })).sort((a,b) => b.score - a.score);`,
    },
  );

  const ranked = [...CANDIDATES]
    .map((name) => ({
      name,
      score: cosine(q, EMBEDDING[name]),
      vector: EMBEDDING[name],
    }))
    .sort((a, b) => b.score - a.score);

  logger.info(
    "│ 正例-rankByCosine",
    "调用函数结束：rankByCosine",
    "为什么打：正例出口——排好序的整张表打出来，便于看谁分高（宠物→猫/狗 接近 1、→石头 接近 0）。当前：sort 已完成。",
    {
      返回值: { ranked, topScore: ranked[0]?.score, bottomScore: ranked[ranked.length - 1]?.score },
      耗时ms: Date.now() - t0,
      字段释义: {
        "ranked[0].score": "最同向候选词的余弦（top1）",
        "ranked.at(-1).score": "最不相似候选词的余弦（bottom1）",
      },
    },
  );
  return ranked;
}

/** 故意拿零向量去撞闸门，让页面看见「算不了余弦」这类 400。 */
export function cosineAgainstZero(query: Word): number {
  const zero: Vec = [0, 0];
  const t0 = Date.now();
  logger.info(
    "│ 对照-cosineAgainstZero",
    "调用函数开始：cosineAgainstZero",
    "为什么打：正例对照——让页面看见「算不了余弦」路径 → HTTP 400。当前：即将拿零向量去撞 cosine()。",
    {
      入参: { query, queryVector: EMBEDDING[query], zero },
      __code: `return cosine(EMBEDDING[query], zero);`,
    },
  );
  // 这里预期 cosine 抛错，由调用方 catch 转 400
  const score = cosine(EMBEDDING[query], zero);
  logger.info(
    "│ 对照-cosineAgainstZero",
    "调用函数结束：cosineAgainstZero",
    "为什么打：正常应当 throw 后被外层 catch；这里出现说明上游 cosine 改动，必须打日志复盘。当前：cosine 没抛错，返回了 score（异常路径）。",
    {
      返回值: score,
      耗时ms: Date.now() - t0,
    },
  );
  return score;
}