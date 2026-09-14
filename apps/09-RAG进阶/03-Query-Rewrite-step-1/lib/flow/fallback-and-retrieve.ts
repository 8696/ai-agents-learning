/**
 * 职责：改写失败用原句兜底（变体 13）—— 调改写失败 / 吐空 → catch → 回退原句直搜。
 * 数据流：query → rewriteAndRetrieve（try/catch）→ 失败回退 retrieveByQuery。
 * 本步核心：改写挂了不能整页报死；page 必须能继续走，用原句检索，标明「本次未改写」。
 */
import { retrieveByQuery, type RetrieveResult } from "./rewrite-and-retrieve.js";
import { rewriteAndRetrieve, type RewriteAndRetrieveResult } from "./rewrite-and-retrieve.js";
import { logger } from "../logger.js";

export type FallbackAndRetrieveResult = {
  query: string;
  /** rewritten = 改写成功；fallback = 改写失败用原句兜底 */
  mode: "rewritten" | "fallback";
  /** fallback 时为什么失败（模型超时 / 吐空 / 解析失败 / 强制触发 等） */
  reason: string;
  /** 实际进入检索的问句（rewritten 时 = 改写句；fallback 时 = 原句） */
  queryUsed: string;
  retrieve: RetrieveResult;
  /** 仅 rewritten 模式存在：原句 + 改写句 + 模型调用详情 */
  rewritten?: RewriteAndRetrieveResult;
};

export async function fallbackAndRetrieve(
  query: string,
  opts: { forceError?: boolean } = {},
): Promise<FallbackAndRetrieveResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-fallbackAndRetrieve",
    "调用函数开始：fallbackAndRetrieve",
    "为什么写这条日志：失败兜底的关键是 catch 后必须能继续走，不能整页报死。当前：即将调改写，里面那次才是真发网络请求。",
    { 入参: { query, forceError: Boolean(opts.forceError) } },
  );

  if (opts.forceError) {
    // 强制失败：用于教学演示「改写挂了怎么兜底」
    const reason = "强制触发改写失败（forceError=true）";
    logger.warn(
      "│ 调用函数-rewriteAndRetrieve",
      "调用函数结束：rewriteAndRetrieve（失败）",
      "为什么写这条日志：强制失败路径，模拟改写模型超时 / 429 / 解析炸掉。当前：try/catch 接住。",
      { 返回值: { reason } },
    );
    const retrieve = retrieveByQuery(query);
    const result: FallbackAndRetrieveResult = {
      query,
      mode: "fallback",
      reason,
      queryUsed: query,
      retrieve,
    };
    logger.info(
      "调用函数-fallbackAndRetrieve",
      "调用函数结束：fallbackAndRetrieve",
      "为什么写这条日志：兜底路径走完，页面要标明「本次未改写」+「为什么」。当前：原句直搜完成。",
      {
        返回值: result,
        耗时ms: Date.now() - t0,
        __code:
          "if (opts.forceError) {\n" +
          "  const retrieve = retrieveByQuery(query);\n" +
          "  return { query, mode: 'fallback', reason, queryUsed: query, retrieve };\n" +
          "}",
        字段释义: {
          mode: "rewritten = 改写成功；fallback = 改写失败用原句兜底",
          reason: "fallback 时为什么失败；rewritten 时为空字符串",
          queryUsed: "rewritten = 改写句；fallback = 原句",
        },
      },
    );
    return result;
  }

  try {
    const rewritten = await rewriteAndRetrieve(query);
    const result: FallbackAndRetrieveResult = {
      query,
      mode: "rewritten",
      reason: "",
      queryUsed: rewritten.rewrittenQuery,
      retrieve: rewritten.retrieve,
      rewritten,
    };
    logger.info(
      "调用函数-fallbackAndRetrieve",
      "调用函数结束：fallbackAndRetrieve",
      "为什么写这条日志：改写成功，返回完整改写 + 检索结果。当前：rewritten 路径走完。",
      {
        返回值: result,
        耗时ms: Date.now() - t0,
        __code: "const rewritten = await rewriteAndRetrieve(query); return { query, mode: 'rewritten', ... };",
      },
    );
    return result;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(
      "│ 调用函数-rewriteAndRetrieve",
      "调用函数结束：rewriteAndRetrieve（失败）",
      "为什么写这条日志：catch 接住后必须回退原句，不能整页 502。当前：即将用原句检索。",
      { 返回值: { reason }, 字段释义: { reason: "失败原因：模型超时 / 429 / 解析炸掉 / 强制触发" } },
    );
    const retrieve = retrieveByQuery(query);
    const result: FallbackAndRetrieveResult = {
      query,
      mode: "fallback",
      reason: reason,
      queryUsed: query,
      retrieve,
    };
    logger.info(
      "调用函数-fallbackAndRetrieve",
      "调用函数结束：fallbackAndRetrieve",
      "为什么写这条日志：兜底路径走完，页面要标明「本次未改写」+「为什么」。当前：原句直搜完成。",
      {
        返回值: result,
        耗时ms: Date.now() - t0,
        __code:
          "catch (error) {\n" +
          "  const retrieve = retrieveByQuery(query);\n" +
          "  return { query, mode: 'fallback', reason: error.message, queryUsed: query, retrieve };\n" +
          "}",
      },
    );
    return result;
  }
}
