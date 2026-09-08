/**
 * 职责：余弦相似度 —— 只看方向夹角，1 同向、0 垂直、-1 反向。
 * 数据流：两个 2 维向量 → 分数；零向量没有方向，抛错给 route 变成 HTTP 400。
 * 为什么不用直线距离：向量长度常被文本长短带着走，我们只关心「说的是不是一回事」。
 *
 * 日志（§5.3.16）：本条是核心档（余弦公式本身）；五件套（含 __code）仍要，零向量抛错前打 warn。
 */
import { logger } from "../logger.js";
import type { Vec } from "./tables.js";

export function cosine(a: Vec, b: Vec): number {
  const t0 = Date.now();
  logger.info(
    "││ 余弦实现-cosine",
    "调用函数开始：cosine",
    "为什么打：本条核心档——余弦公式只在 ranks/正例/零向量对照里被调用，不打就看不见「分母是 na*nb」。当前：即将算 dot / na / nb。",
    {
      入参: { a, b },
      __code: `const dot = a[0]*b[0] + a[1]*b[1];\nconst na = Math.sqrt(a[0]*a[0] + a[1]*a[1]);\nconst nb = Math.sqrt(b[0]*b[0] + b[1]*b[1]);\nreturn dot / (na * nb);`,
    },
  );

  const dot = a[0] * b[0] + a[1] * b[1];
  const na = Math.sqrt(a[0] * a[0] + a[1] * a[1]);
  const nb = Math.sqrt(b[0] * b[0] + b[1] * b[1]);
  if (na === 0 || nb === 0) {
    // 真实管线里遇到零向量，多半是上游解析出了空文本
    logger.warn(
      "││ 余弦实现-cosine",
      "调用函数结束：cosine（失败）",
      "为什么打：分母为 0 → 抛「零向量没有方向」让 route 回 400；warn 是「业务失败但能走通」的等级（§5.3.16 三档）。当前：即将 throw，rank.ts 的 catch 会接住。",
      {
        返回值: undefined,
        a,
        b,
        na,
        nb,
        耗时ms: Date.now() - t0,
      },
    );
    throw new Error("零向量没有方向，算不了余弦");
  }
  const score = dot / (na * nb);
  logger.info(
    "││ 余弦实现-cosine",
    "调用函数结束：cosine",
    "为什么打：分数就是 route 拿去排序的键，不打就丢了一个数。当前：返回 score = dot/(na*nb)。",
    {
      返回值: score,
      耗时ms: Date.now() - t0,
      字段释义: {
        score: "1 同向 / 0 垂直 / -1 反向；rankByCosine 用它降序排",
      },
    },
  );
  return score;
}