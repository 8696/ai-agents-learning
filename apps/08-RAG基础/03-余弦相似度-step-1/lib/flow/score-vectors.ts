/**
 * 本步核心：用三把尺子给同一组二维教学向量打分，让「语义近 = 夹角小」看得见。
 *
 * 职责：本地算出余弦相似度（Cosine Similarity）/ 点积（Dot Product）/ 欧氏距离（Euclidean Distance），
 *       并标出短同向 vs 长同向谁赢。六种 mode：raw / topk / threshold / cross-model / contrast / normalize。
 *       不调大模型，不入库。
 *
 * 数据流：问题向量 + 卡片列表 → 逐张算分数 → 按尺子方向排序 → K 截断（可选）→
 *         阈值判定（可选）→ 归一化（可选）→ 带回教学判定。
 */
import { withCall } from "../log/with-call.js";
import { judgeShortVsLong } from "./judge-short-vs-long.js";

export type ScoreMetric = "cosine" | "dot" | "euclidean";

export type ScoreCard = {
  id: string;
  label: string;
  text: string;
  vector: number[];
};

export type RankedCard = ScoreCard & {
  score: number;
  rank: number;
};

export type ScoreResult = {
  metric: ScoreMetric;
  higherIsNearer: boolean;
  query: { label: string; text: string; vector: number[] };
  cards: RankedCard[];
  topK: RankedCard[];
  dropped: RankedCard[];
  k: number;
  threshold: number | null;
  maxScore: number;
  decision: "answer" | "abstain";
  abstainReason: string | null;
  scaleFactor: number;
  normalized: boolean;
  shortVsLong: "tie" | "long-wins" | "long-loses" | "missing";
  判定: string;
};

export const TEACHING_QUERY = {
  label: "问题（query）",
  text: "昨天买的杯子裂了，怎么退？",
  vector: [1, 0],
};

export const TEACHING_CARDS: ScoreCard[] = [
  {
    id: "short",
    label: "短同向（short same-direction）",
    text: "运输破损可补发或退货。",
    vector: [1, 0],
  },
  {
    id: "long",
    label: "长同向（long same-direction）",
    text: "运输破损可补发或退货。以下情形由买家自行承担且不影响本条结论：签收后自行摔坏、未在 48 小时内拍照举证、包装丢弃无法核对物流责任、偏远地区二次运输损耗、赠品缺失、发票抬头与下单人不一致时的改开周期、七个工作日内核销延迟、以及客服值班话术中出现的其他免责说明。本段只是把同一句政策写长，意思没有变。",
    vector: [10, 0],
  },
  {
    id: "side",
    label: "略偏（slightly off）",
    text: "包装完好的商品支持 7 天无理由退货。",
    vector: [0.8, 0.6],
  },
  {
    id: "synonym",
    label: "近义不同字（synonym，方向接近但原文不逐字）",
    text: "运输途中碎了，可以补发。",
    vector: [0.95, 0.31],  // 与 query=[1,0] 方向接近（cosine ≈ 0.95），但与 short 不完全重合
  },
  {
    id: "conflict",
    label: "冲突政策（conflict，方向反向但不到 -1）",
    text: "破损一律不退。",
    vector: [-0.8, 0.6],  // 与 query=[1,0] 余弦 = -0.8；演示「真实嵌入里反向但很少到 -1」
  },
  {
    id: "far",
    label: "无关（orthogonal）",
    text: "发票默认开个人抬头，对公请提供税号。",
    vector: [0, 1],
  },
];

export class ScoreInputError extends Error {
  readonly httpStatus = 400;
  constructor(message: string) {
    super(message);
    this.name = "ScoreInputError";
  }
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function vectorLength(a: number[]): number {
  return Math.sqrt(dotProduct(a, a));
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const denom = vectorLength(a) * vectorLength(b);
  if (denom === 0) {
    throw new ScoreInputError("零向量算不了余弦相似度（Cosine Similarity）：分母是两个长度相乘，长度为 0 不能除");
  }
  return dotProduct(a, b) / denom;
}

function scoreOne(metric: ScoreMetric, query: number[], card: number[], scaleFactor: number): number {
  const raw =
    metric === "cosine"
      ? cosineSimilarity(query, card)
      : metric === "dot"
        ? dotProduct(query, card)
        : euclideanDistance(query, card);
  // scaleFactor 模拟「换嵌入模型」—— 不同模型的分数尺度差就是乘以常数
  // cosine 理论上 ∈ [-1, 1]，被 scaleFactor 乘后会越界，恰好演示「换模型后分数不能当余弦看」
  return raw * scaleFactor;
}

export function scoreVectors(input: {
  metric: ScoreMetric;
  query: { label: string; text: string; vector: number[] };
  cards: ScoreCard[];
  k?: number;
  threshold?: number | null;
  scaleFactor?: number;
  normalize?: boolean;
}): Promise<ScoreResult> {
  // 五 mode 共享同一核心函数
  // - k 不传 = 卡片数（全表；等价于「无截断」）
  // - threshold 不传 = null（哨兵 = 无限位，永远 answer；有限数 = 真阈值）
  // - scaleFactor 不传 = 1.0（不模拟换模型；传 2/0.5 = 模拟另一家嵌入模型）
  // - normalize 不传 = false；true = 先 L2 归一化（变成长度 1 的单位向量）
  const k = input.k ?? input.cards.length;
  const threshold = input.threshold ?? null;
  const scaleFactor = input.scaleFactor ?? 1.0;
  const normalize = input.normalize ?? false;
  return withCall({
    scope: "│ 调用函数-scoreVectors",
    name: "scoreVectors",
    explainStart:
      "为什么写这条日志：本步核心就是三把尺子怎么给同一组箭头打分（raw）/ 加 K 截断（topk）/ 加阈值弃权（threshold）。当前：路由已校验入参，准备逐张算分。",
    explainEnd: "为什么写这条日志：页面要对照前 K 条 + 弃权/出 + 「短 vs 长」判定。当前：分数、排序、截断、阈值判定已算完。",
    入参: input,
    __code:
      "逐张 scoreOne(metric, query, card) → 按 higherIsNearer 全表排序赋 rank → 截前 K=topK → dropped → maxScore = topK[0].score → 按尺子方向比阈值 → decision + abstainReason → judgeShortVsLong 按全表",
    字段释义: {
      metric: "本侧尺子：cosine / dot / euclidean",
      higherIsNearer: "true=分数越大越近（余弦/点积）；false=分数越小越近（欧氏）",
      topK: "按本侧尺子排序后截前 K 条",
      dropped: "全表里没进前 K 的那些",
      k: "Top-K 的 K；不传 = 卡片数（全表）",
      threshold: "相似度门；不传 = 永远 answer",
      maxScore: "topK 第一名的分数",
      decision: "answer=够阈值；abstain=最高分不够",
      abstainReason: "为什么弃权（人话）",
      shortVsLong: "本步主对照（按全表算）：tie / long-wins / long-loses",
      判定: "给人看的一句：这把尺子有没有被长度骗",
    },
    fn: () => {
      const dim = input.query.vector.length;
      if (input.cards.some((card) => card.vector.length !== dim)) {
        throw new ScoreInputError("问题和卡片的维数必须一样，否则点积对不上位。");
      }
      if (!Number.isInteger(k) || k < 1) {
        throw new ScoreInputError("Top-K 的 K 必须是 ≥1 的整数");
      }
      if (k > input.cards.length) {
        throw new ScoreInputError(`Top-K 的 K=${k} 超过卡片数 ${input.cards.length}`);
      }
      if (threshold !== null && !Number.isFinite(threshold)) {
        throw new ScoreInputError("阈值（threshold）必须是有限数字（或不传 = 不启用）。");
      }
      if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
        throw new ScoreInputError("scaleFactor 必须是正有限数字（>0），用来模拟换嵌入模型的分数尺度差异。");
      }
      // 归一化逻辑：L2 normalize（每个向量除以自己的长度，变成长度 1 的单位向量）
      const normalizeVec = function (v: number[]): number[] {
        const lenSq = v.reduce(function (s, x) { return s + x * x; }, 0);
        const len = Math.sqrt(lenSq);
        if (len === 0) {
          throw new ScoreInputError("零向量不能归一化（除以 0 会无意义）。");
        }
        return v.map(function (x) { return x / len; });
      };
      const normQuery = normalize ? normalizeVec(input.query.vector) : input.query.vector;
      const normCards = normalize
        ? input.cards.map(function (c) { return Object.assign({}, c, { vector: normalizeVec(c.vector) }); })
        : input.cards;
      const higherIsNearer = input.metric !== "euclidean";
      const scored = normCards.map((card) => ({
        ...card,
        score: scoreOne(input.metric, normQuery, card.vector, scaleFactor),
        rank: 0,
      }));
      scored.sort((a, b) => (higherIsNearer ? b.score - a.score : a.score - b.score));
      const ranked = scored.map((card, index) => ({ ...card, rank: index + 1 }));
      const topK = ranked.slice(0, k);
      const dropped = ranked.slice(k);
      const maxScore = topK[0] ? topK[0].score : (ranked[0] ? ranked[0].score : 0);
      // 阈值方向：余弦/点积 → maxScore < threshold 弃权；欧氏 → maxScore > threshold 弃权
      // threshold = null（不传时）→ 不过滤 → 永远 answer
      const tooLow = threshold === null
        ? false
        : (higherIsNearer ? maxScore < threshold : maxScore > threshold);
      const decision: "answer" | "abstain" = tooLow ? "abstain" : "answer";
      const abstainReason = tooLow
        ? higherIsNearer
          ? `最高分 ${maxScore.toFixed(4)} 低于阈值 ${(threshold as number).toFixed(4)}（余弦/点积阈值是下限）——几何上「库里没有」，别把卡片当答案喂给模型。`
          : `最高分（最小距离）${maxScore.toFixed(4)} 大于阈值 ${(threshold as number).toFixed(4)}（欧氏阈值是上限）——最近的一张也站得太远，标记不可用。`
        : null;
      // 判定按全表算（ranked），不按 topK 算——避免「长同向被截出 topK，就判 long-loses」
      const judged = judgeShortVsLong(
        input.metric,
        ranked.find((card) => card.id === "short"),
        ranked.find((card) => card.id === "long"),
      );
      return {
        metric: input.metric,
        higherIsNearer,
        query: input.query,
        cards: ranked,
        topK,
        dropped,
        k,
        threshold,
        maxScore,
        decision,
        abstainReason,
        scaleFactor,
        normalized: normalize,
        ...judged,
      };
    },
  });
}
