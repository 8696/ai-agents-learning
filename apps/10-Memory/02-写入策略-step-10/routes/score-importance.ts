/**
 * 职责：POST /api/score-importance —— 调模型给库里未评估的事实打重要性 + 衰减建议 + 有效期。
 * 数据流：scoreImportance(userId) → 模型调用 → 写回 importance / importance_reasoning / validUntil → 返 { scored, results }
 *
 * 本步「谁判、代码判」分工的「模型判」一端：第 6 关四种过期方式里的关键业务判断（事实是否永不过期 / 多快过期 / 重要程度）由模型判。
 * 另一端「代码判」在 lib/flow/expiration.ts：用模型给的 importance + validUntil 算衰减权重 + 决定是否归档。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { scoreImportance } from "../lib/flow/score-importance.js";
import { logger } from "../lib/logger.js";

export function mountScoreImportanceRoutes(router: Router): void {
  router.post("/api/score-importance", async (ctx: Context) => {
    logger.info(
      "调用函数-score-importance-route",
      "调用函数开始：POST /api/score-importance",
      "为什么写这条日志：第 6 关「谁判、代码判」分工的入口——让模型决定「事实多快过期 + 重要程度」，代码按模型给的规则算衰减 + 归档。当前：准备调 scoreImportance。",
      { 入参: { userId: "default" }, __code: "const result = await scoreImportance('default');" },
    );
    try {
      const t0 = Date.now();
      const result = await scoreImportance("default");
      logger.info(
        "调用函数-score-importance-route",
        "调用函数结束：POST /api/score-importance",
        `为什么写这条日志：让前端看到模型评了多少条 + 每条给的评分和理由。当前：scored = ${result.scored}，耗时 = ${Date.now() - t0}ms。`,
        { 返回值: result, 耗时ms: Date.now() - t0 },
      );
      ctx.body = result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        "调用函数-score-importance-route",
        "调用函数结束：POST /api/score-importance（失败）",
        `为什么写这条日志：模型调用失败（最常见 = 缺 Key / 网络断 / 模型返回的 JSON 解析失败）。当前：scoreImportance 抛错，错误 = ${message}。`,
        { 异常信息: message },
      );
      ctx.status = 500;
      ctx.body = { error: "INTERNAL_ERROR", explain: message };
    }
  });
}