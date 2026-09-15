/**
 * 职责：GET /api/recall，按衰减权重排序返回召回候选 + 命中后更新 last_used_at + use_count += 1。
 * 数据流：{ query?, topK? } → recallWithDecay(userId, opts) → JSON
 *
 * step-10 第 6 关变体 6-C「不用就衰减」主入口。
 * 与 step-9 routes/recall.ts 区别：本步排除 archived_at 非 NULL + 按 computeDecayWeight 排序 + 命中后更新。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { recallWithDecay, getAsOf } from "../lib/flow/expiration.js";
import { logger } from "../lib/logger.js";

export function mountRecallRoutes(router: Router): void {
  router.get("/api/recall", async (ctx: Context) => {
    const query = typeof ctx.query.query === "string" ? ctx.query.query : undefined;
    const topK = typeof ctx.query.topK === "string" ? Number(ctx.query.topK) : undefined;
    const asOf = getAsOf();

    logger.info(
      "调用函数-recall",
      "调用函数开始：GET /api/recall",
      `为什么写这条日志：6-C 变体主入口——按衰减权重排序 + 命中后更新 last_used_at（满足需求 6 验收 ③）。当前：拿到 query = ${query || "(无)"}，topK = ${topK || "(全部)"}。`,
      { 入参: { query, topK }, __code: "const candidates = await recallWithDecay('default', { asOf, topK, query });" },
    );

    const t0 = Date.now();
    const candidates = recallWithDecay("default", { asOf, topK, query });
    const count = candidates.length;
    logger.info(
      "调用函数-recall",
      "调用函数结束：GET /api/recall",
      `为什么写这条日志：让页面拿到每条候选的衰减权重 / validUntil / lastUsedAt / useCount 用于对照；命中事实已更新 last_used_at + use_count += 1。当前：召回完成，共 ${count} 条。`,
      { 返回值: { candidates, count }, 耗时ms: Date.now() - t0, 字段释义: {
        "candidates[].decayWeight": "衰减权重（越大越优先）",
        "candidates[].validUntil": "事实自带有效期；null = 永不过期（变体 6-B + 6-A）",
        "candidates[].lastUsedAt": "最近一次被 recall 并使用的时间；null = 从未用过",
        "candidates[].useCount": "被 recall 次数（log 项 + 1）",
        "candidates[].daysSinceLastUsed": "距 lastUsedAt 多少天",
      } },
    );

    ctx.body = { candidates, count };
  });
}