/**
 * 本步核心：业务加权打分（Business Re-ranking / Rule-based Re-ranking）。
 *
 * 职责：
 *   - scoreAndRerankBusiness：拿神经精排后的候选 + businessWeight 配置 →
 *     按每张卡的 updatedAt 与今天（教学锚点 TODAY_ISO）的距离，符合窗口的卡片加 bonus
 *     → 综合分 finalScore = rerankScore + businessBonus → 按 finalScore 降序重排 → 返回业务加权榜
 *
 * 数据流：
 *   输入 { query, candidates, businessWeight } →
 *   ① 取每张候选的 updatedAt（从 CORPUS 查）→
 *   ② 按 businessWeight.on 决定是否启用加权 →
 *   ③ 每张候选算 businessBonus = (距今 ≤ recentDays) ? bonus : 0
 *   ④ 综合分 finalScore = rerankScore + businessBonus
 *   ⑤ 按 finalScore 降序排 + 赋 rank + 记 previousRank（神经精排原名次）
 *   ⑥ 返回 rows（带 rerankScore / businessBonus / finalScore / rank / previousRank）
 *
 * 不调网络：本跳纯本地计算（按 updatedAt 与今天比距离）。里面那次神经打分在 lib/flow/rerank.ts 里，已经走过。
 *
 * 为什么单独成文件：本条教学点 = "业务加权 ≠ 神经精排"。
 * 学习者打开这一个文件就能把"业务规则怎么叠 + 怎么重排"读完。
 * route 只校验入参 → 调本文件 → 写 ctx.body。
 */
import { z } from "zod";
import { withCall } from "../http/with-call.js";
import { HttpError } from "../http/send-error.js";
import { CORPUS, TODAY_ISO } from "../corpus/knowledge-base.js";
import type { RerankRow } from "./rerank.js";

export type BusinessWeight = {
  /** 是否启用业务加权；false 时返回的 rows.finalScore === rerankScore，rank 不变 */
  on: boolean;
  /** "近 N 天编辑过"的窗口（天）；卡片 updatedAt 距今 ≤ recentDays → 加权 */
  recentDays: number;
  /** 加权分大小（神经分之外的额外分） */
  bonus: number;
};

export type BusinessInput = {
  /** 用户原始问句 —— 业务加权不改问句字符串 */
  query: string;
  /** 神经精排后的候选（一般是 RerankResult.rows） */
  candidates: RerankRow[];
  /** 业务权重配置 */
  businessWeight: BusinessWeight;
};

export type BusinessRow = {
  cardId: string;
  text: string;
  /** 神经分（沿用上游精排结果，不动） */
  rerankScore: number;
  /** 业务加权分：启用且"近 N 天"才 > 0；否则 0 */
  businessBonus: number;
  /** 综合分 = 神经分 + 业务加权分；按它重排 */
  finalScore: number;
  /** 业务加权后的最终名次（1-based） */
  rank: number;
  /** 神经精排原 rank —— 仅靠业务加权抬起来的名次用得上 */
  previousRank: number;
  /** 卡片更新时间（便于页面上看到"是这张新"） */
  updatedAt: string;
  /** 是否触发业务加权（距今 ≤ recentDays） */
  boosted: boolean;
};

export type BusinessResult = {
  query: string;
  /** 业务加权配置快照（便于页面展示当前开关状态） */
  businessWeight: BusinessWeight;
  /** 业务加权后的最终榜 */
  rows: BusinessRow[];
  /** 至少有一条条目名次因业务加权而变化 */
  anyRankChanged: boolean;
  /** 总耗时（纯本地） */
  elapsedMs: number;
};

/** 算两张日期之间差多少天（按 UTC 日历日粗略算；教学够用，不走时区） */
function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + "T00:00:00Z").getTime();
  const to = new Date(toIso + "T00:00:00Z").getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new HttpError(500, "日期解析失败", `from=${fromIso} to=${toIso}`);
  }
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

const inputSchema = z.object({
  query: z.string().min(1, "query 不能为空"),
  candidates: z.array(z.unknown()).min(1, "候选不能为空"),
  businessWeight: z.object({
    on: z.boolean(),
    recentDays: z.number().int().min(1).max(365),
    bonus: z.number().min(0).max(1),
  }),
});

export async function scoreAndRerankBusiness(input: BusinessInput): Promise<BusinessResult> {
  const parsed = inputSchema.parse({
    query: input.query,
    candidates: input.candidates,
    businessWeight: input.businessWeight,
  });
  const query = parsed.query;
  const candidates = parsed.candidates as RerankRow[];
  const businessWeight = parsed.businessWeight;

  if (!query.trim()) {
    throw new HttpError(400, "query 是空的", "输入框写一句再点精排");
  }
  if (candidates.length === 0) {
    throw new HttpError(400, "候选列表为空", "先跑粗召回 + 神经精排，再送进业务加权");
  }

  const t0 = Date.now();

  return await withCall({
    scope: " 调用函数-scoreAndRerankBusiness",
    kind: "函数",
    name: "scoreAndRerankBusiness（业务加权打分 + 重排）",
    explain:
      "为什么写这条日志：本步核心 = 业务加权。纯本地计算，按每张卡的 updatedAt 与今天（教学锚点 TODAY_ISO）比距离，符合 recentDays 窗口的加 bonus。当前：神经精排后的 N 条候选已到，准备按业务规则加分并重排。",
    args: {
      query,
      candidateCount: candidates.length,
      candidateIds: candidates.map((c) => c.cardId),
      businessWeight,
    },
    code: "scoreAndRerankBusiness({ query, candidates, businessWeight })",
    run: async () => {
      // ① 建 CORPUS id → updatedAt 映射，便于查每张卡的更新时间
      const updatedAtMap = new Map<string, string>();
      for (const card of CORPUS) {
        updatedAtMap.set(card.id, card.updatedAt);
      }

      // ② 对每张候选算 businessBonus + finalScore
      const rows = candidates.map<BusinessRow>((c) => {
        const updatedAt = updatedAtMap.get(c.cardId) ?? "";
        const ageDays = updatedAt ? Math.max(0, daysBetween(updatedAt, TODAY_ISO)) : Number.POSITIVE_INFINITY;
        const boosted = businessWeight.on && ageDays <= businessWeight.recentDays;
        const businessBonus = boosted ? businessWeight.bonus : 0;
        const finalScore = c.rerankScore + businessBonus;
        return {
          cardId: c.cardId,
          text: c.text,
          rerankScore: c.rerankScore,
          businessBonus,
          finalScore,
          rank: 0,
          previousRank: c.rank,
          updatedAt,
          boosted,
        };
      });

      // ③ 按 finalScore 降序排 + 赋 rank
      rows.sort((a, b) => b.finalScore - a.finalScore);
      rows.forEach((r, idx) => {
        r.rank = idx + 1;
      });

      // ④ 判定：是否至少有一条条目名次因业务加权变了
      const anyRankChanged = rows.some((r) => r.rank !== r.previousRank);

      return {
        query,
        businessWeight,
        rows,
        anyRankChanged,
        elapsedMs: Date.now() - t0,
      };
    },
  });
}