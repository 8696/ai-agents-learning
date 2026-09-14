/**
 * 职责：锚点问句不改写（变体 7）—— 检测货号 / 条款编号，命中则跳过改写、原句直搜；否则走改写后检索。
 * 数据流：query → detectAnchor → 命中/未命中 → 选择原句直搜 / rewriteAndRetrieve。
 * 本步核心：锚点是「主键」，交给改写模型会把主键改成模糊主题，BM25 优势没了；改写是开关，不是信仰。
 * 为什么放 lib/flow：和扩展、改写平级；不复写「改写 + 检索」整套，只多一层判定分支。
 */
import { retrieveByQuery, type RetrieveResult } from "./rewrite-and-retrieve.js";
import { rewriteAndRetrieve, type RewriteAndRetrieveResult } from "./rewrite-and-retrieve.js";
import { logger } from "../logger.js";

export type AnchorDetection = {
  isAnchor: boolean;
  reason: string;
  matchedText: string;
};

/**
 * 锚点检测：SKU 编号 + 条款编号。
 * 命中任意一条即视为锚点 → 跳过改写。
 * 没识别到 = 不是锚点（不代表问句「没价值」，只是这次不改写也不会丢锚点）。
 */
function detectAnchor(query: string): AnchorDetection {
  const skuMatch = query.match(/[Ss][Kk][Uu][_-]?\d+/);
  if (skuMatch) {
    return { isAnchor: true, matchedText: skuMatch[0], reason: "命中 SKU 编号" };
  }
  const clauseMatch = query.match(/(条款\s*\d+(\.\d+)?|第\s*\d+\s*[条款款])/);
  if (clauseMatch) {
    return { isAnchor: true, matchedText: clauseMatch[0], reason: "命中条款编号" };
  }
  const sectionMatch = query.match(/[Ss]ection\s*\d+(\.\d+)?/);
  if (sectionMatch) {
    return { isAnchor: true, matchedText: sectionMatch[0], reason: "命中 Section 编号" };
  }
  return { isAnchor: false, matchedText: "", reason: "未命中锚点（无 SKU / 条款 / Section 编号）" };
}

export type AnchorAndRetrieveResult = {
  query: string;
  anchor: AnchorDetection;
  /** 实际走的检索模式：skipped = 跳过改写原句直搜；rewritten = 调了改写 */
  mode: "skipped" | "rewritten";
  /** skipped 时 = 原句直搜的检索结果；rewritten 时 = 改写句检索结果 */
  retrieve: RetrieveResult;
  /** 仅 rewritten 模式：原句 + 改写句 + 模型调用详情 */
  rewritten?: RewriteAndRetrieveResult;
};

export async function anchorAndRetrieve(
  query: string,
  hasLlm: boolean,
): Promise<AnchorAndRetrieveResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-anchorAndRetrieve",
    "调用函数开始：anchorAndRetrieve",
    "为什么写这条日志：锚点检测决定走原句直搜还是改写，页面要看见依据。当前：刚进入，按 query 扫锚点。",
    { 入参: { query, hasLlm } },
  );

  const anchor = detectAnchor(query);
  logger.info(
    "│ 调用函数-detectAnchor",
    "调用函数开始：detectAnchor",
    "为什么写这条日志：锚点判定是页面要看见的关键输出。当前：按 SKU / 条款 / Section 三条正则扫。",
    {
      入参: { query },
      __code:
        "const skuMatch = query.match(/[Ss][Kk][Uu][_-]?\\d+/);\n" +
        "const clauseMatch = query.match(/(条款\\s*\\d+(\\.\\d+)?|第\\s*\\d+\\s*[条款款])/);\n" +
        "const sectionMatch = query.match(/[Ss]ection\\s*\\d+(\\.\\d+)?/);",
    },
  );

  // 命中锚点 OR 没密钥 → 跳过改写，原句直搜
  if (anchor.isAnchor || !hasLlm) {
    const retrieve = retrieveByQuery(query);
    const result: AnchorAndRetrieveResult = {
      query,
      anchor,
      mode: "skipped",
      retrieve,
    };
    logger.info(
      "调用函数-anchorAndRetrieve",
      "调用函数结束：anchorAndRetrieve",
      "为什么写这条日志：页面要看见为什么跳过改写 + 原句名单是什么。当前：原句直搜完成。",
      {
        返回值: result,
        耗时ms: Date.now() - t0,
        __code:
          "if (anchor.isAnchor || !hasLlm) {\n" +
          "  const retrieve = retrieveByQuery(query);\n" +
          "  return { query, anchor, mode: 'skipped', retrieve };\n" +
          "}",
        字段释义: {
          "anchor.isAnchor": "true = 命中锚点；改写会把主键改成模糊主题，BM25 优势没了",
          "mode": "skipped = 跳过改写原句直搜；rewritten = 调了改写模型",
        },
      },
    );
    return result;
  }

  // 不命中 + 有密钥 → 正常调改写
  const rewritten = await rewriteAndRetrieve(query);
  const result: AnchorAndRetrieveResult = {
    query,
    anchor,
    mode: "rewritten",
    retrieve: rewritten.retrieve,
    rewritten,
  };
  logger.info(
    "调用函数-anchorAndRetrieve",
    "调用函数结束：anchorAndRetrieve",
    "为什么写这条日志：锚点没命中，按普通改写路径走。当前：改写 + 检索都完成。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      __code:
        "const rewritten = await rewriteAndRetrieve(query);\n" +
        "return { query, anchor, mode: 'rewritten', retrieve: rewritten.retrieve, rewritten };",
      字段释义: {
        rewritten: "原句 + 改写句 + 改写模型调用详情；仅 rewritten 模式存在",
      },
    },
  );
  return result;
}
