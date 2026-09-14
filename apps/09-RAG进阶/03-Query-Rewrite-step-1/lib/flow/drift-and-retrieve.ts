/**
 * 职责：改写改偏可回退（变体 8）—— 服务端按用户传的 forcedRewrittenQuery 模拟「改坏的改写」，
 *       同时返回原句直搜结果，方便页面对照；前端「用原句重搜」按钮复用 /api/search-original。
 * 数据流：query + forcedRewrittenQuery → retrieveByQuery(原句) + retrieveByQuery(改偏) → 两份名单。
 * 本步核心：改写改偏不能只展示改偏结果；必须能对照、能一键回退原句检索。
 */
import { retrieveByQuery, type RetrieveResult } from "./rewrite-and-retrieve.js";
import { logger } from "../logger.js";

export type DriftAndRetrieveResult = {
  query: string;
  /** 强制模拟的改偏后查询（不是真调模型） */
  forcedRewrittenQuery: string;
  /** 改偏原因说明（让用户知道为什么这一条会改偏） */
  driftReason: string;
  /** 原句检索结果 */
  originalRetrieve: RetrieveResult;
  /** 用 forcedRewrittenQuery 检索的结果（这是「改偏后的名单」） */
  driftedRetrieve: RetrieveResult;
};

export function driftAndRetrieve(
  query: string,
  forcedRewrittenQuery: string,
  driftReason: string,
): DriftAndRetrieveResult {
  const t0 = Date.now();
  logger.info(
    "调用函数-driftAndRetrieve",
    "调用函数开始：driftAndRetrieve",
    "为什么写这条日志：改偏可回退的核心是同时拿到原句名单 + 改偏名单。当前：即将按用户传的两串字分别检索。",
    { 入参: { query, forcedRewrittenQuery, driftReason } },
  );

  const originalRetrieve = retrieveByQuery(query);
  const driftedRetrieve = retrieveByQuery(forcedRewrittenQuery);
  const result: DriftAndRetrieveResult = {
    query,
    forcedRewrittenQuery,
    driftReason,
    originalRetrieve,
    driftedRetrieve,
  };

  logger.info(
    "调用函数-driftAndRetrieve",
    "调用函数结束：driftAndRetrieve",
    "为什么写这条日志：页面要看见两份名单 + driftReason + 一键回退入口。当前：两份检索都完成。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      __code:
        "const originalRetrieve = retrieveByQuery(query);\n" +
        "const driftedRetrieve = retrieveByQuery(forcedRewrittenQuery);\n" +
        "return { query, forcedRewrittenQuery, driftReason, originalRetrieve, driftedRetrieve };",
      字段释义: {
        originalRetrieve: "用原句检索的名单；词汇鸿沟时目标切块不上桌",
        driftedRetrieve: "用 forcedRewrittenQuery 检索的名单；改偏时命中的是错误类文档",
        driftReason: "页面要展示：为什么这一条算「改偏」（教学用）",
      },
    },
  );
  return result;
}
