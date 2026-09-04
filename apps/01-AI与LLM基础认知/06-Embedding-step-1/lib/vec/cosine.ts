/**
 * 职责：余弦相似度 —— 只看方向夹角，1 同向、0 垂直、-1 反向。
 * 数据流：两个 2 维向量 → 分数；零向量没有方向，抛错给 route 变成 HTTP 400。
 * 为什么不用直线距离：向量长度常被文本长短带着走，我们只关心「说的是不是一回事」。
 */
import { logger } from "../logger.js";
import type { Vec } from "./tables.js";

export function cosine(a: Vec, b: Vec): number {
  const dot = a[0] * b[0] + a[1] * b[1];
  const na = Math.sqrt(a[0] * a[0] + a[1] * a[1]);
  const nb = Math.sqrt(b[0] * b[0] + b[1] * b[1]);
  if (na === 0 || nb === 0) {
    // 真实管线里遇到零向量，多半是上游解析出了空文本
    logger.warn(
      "余弦-零向量",
      "分母为 0，零向量没有方向",
      "真实管线里多半是上游解析出了空文本；本 demo 故意拿零向量撞闸门演示 400 路径",
      { a, b, na, nb },
    );
    throw new Error("零向量没有方向，算不了余弦");
  }
  return dot / (na * nb);
}
