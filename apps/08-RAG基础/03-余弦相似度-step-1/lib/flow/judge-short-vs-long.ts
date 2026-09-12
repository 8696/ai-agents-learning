/**
 * 职责：「短 vs 长」对照判定——基于全表 ranked 数组（不是 topK），不受 K 截断污染。
 *       拆到独立文件，因为 score-vectors.ts 接近 §5.3.8 行数上限。
 *
 * 数据流：scoreVectors 调本函数，传「全表排好的短同向 + 长同向 RankedCard」+ 本侧 metric → 回判定文案。
 */
import type { RankedCard, ScoreMetric, ScoreResult } from "./score-vectors.js";

export function judgeShortVsLong(
  metric: ScoreMetric,
  short: RankedCard | undefined,
  long: RankedCard | undefined,
): { shortVsLong: ScoreResult["shortVsLong"]; 判定: string } {
  if (!short || !long) {
    return { shortVsLong: "missing", 判定: "教学集缺短同向或长同向，无法做本步主对照。" };
  }
  const same = Math.abs(short.score - long.score) < 1e-9;
  if (metric === "cosine") {
    return {
      shortVsLong: same ? "tie" : long.score > short.score ? "long-wins" : "long-loses",
      判定: same
        ? "余弦只看方向：短同向和长同向分数并列，长度没有加分。"
        : "这组向量方向应相同；若分数不并列，先核对入参是不是被改过。",
    };
  }
  if (metric === "dot") {
    return {
      shortVsLong: long.score > short.score ? "long-wins" : same ? "tie" : "long-loses",
      判定:
        long.score > short.score
          ? "点积不除长度：长同向把同一方向拉长，分数更大，检索会让长卡片赢。"
          : "点积这一侧预期长同向赢；若没赢，先看向量是不是还是教学集。",
    };
  }
  return {
    shortVsLong: long.score > short.score ? "long-loses" : same ? "tie" : "long-wins",
    判定:
      long.score > short.score
        ? "欧氏距离看两点有多远：长同向和问题差了一截，被判成更远，同义长块会掉出前 K 条。"
        : "欧氏这一侧预期长同向更远（分数更大）；若不是，先看向量是不是还是教学集。",
  };
}