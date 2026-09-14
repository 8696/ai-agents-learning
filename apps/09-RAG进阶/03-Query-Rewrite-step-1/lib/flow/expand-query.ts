/**
 * 职责：扩展（Query Expansion）本地版 —— 规则补词，不调模型。
 * 数据流：原句 → 拆词 → 命中规则表 → 拼出 expandedQuery → 复用 retrieveByQuery。
 * 本步核心：扩展 = 原句保留 + 后面补词，仍是一次检索。
 *          与改写（整句换词）不同；与多路检索（多条问句分别检索再合并）不同。
 * 为什么放 lib/flow：扩展仍属「检索前处理」，和改写在同一层；
 * 不调模型也能展开主路径（拆词 + 命中 + 拼）—— 但展开只展开外层，
 * 内层 expandByRules 同步短函数走普通函数简写风格（外层 cover 入参/返回值）。
 */
import { retrieveByQuery, type RetrieveResult } from "./rewrite-and-retrieve.js";
import { logger } from "../logger.js";

/**
 * 同义词 / 政策名补词表（手动维护，只覆盖本条小节提到的关键词）。
 * key 用 2 字中文 2-gram（和 retrieveByQuery 的 extractTerms 同款拆分）。
 * 命中词 = 原句里出现的 2-gram；产出 = 该 2-gram 对应的库用语（多个）。
 * 不调模型、不查词库 = 规则实现；可以解释、可复现、不会改偏。
 */
const RULE_TERMS: Record<string, string[]> = {
  "还能退": ["七天无理由", "未拆封"],
  "退吗": ["七天无理由", "未拆封"],
  "退货": ["七天无理由", "未拆封"],
  "换货": ["尺码", "颜色"],
  "换吗": ["换货", "尺码"],
  "保修": ["三包", "维修"],
  "维修": ["保修", "三包"],
  "发票": ["电子发票", "报销"],
  "运费": ["偏远地区", "自理"],
  "积分": ["不可抵扣", "不可兑现"],
  "假货": ["正品", "防伪"],
};

export type ExpandAndRetrieveResult = {
  originalQuery: string;
  expandedQuery: string;
  /** 补进来的库用语；和原句相比的增量 */
  addedTerms: string[];
  /** 复用 retrieveByQuery 的返回：检索用的问句、拆词、名单、进检索名单 id、目标切块 */
  retrieve: RetrieveResult;
};

function tokenizeForExpansion(query: string): string[] {
  // 和 retrieveByQuery 的 extractTerms 同款：先清理标点，再对每个 token 切 2-gram。
  // key 是 2-gram；这里只产出 2-gram 集合去查 RULE_TERMS。
  const cleaned = query.replace(/[，。？?！!、,.；;：:\s]+/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const grams = new Set<string>();
  for (const part of parts) {
    for (let i = 0; i < part.length - 1; i += 1) {
      const gram = part.slice(i, i + 2);
      if (/[一-鿿]/.test(gram)) grams.add(gram);
    }
  }
  return [...grams];
}

/**
 * 规则补词：原句保留 → 后面拼 addedTerms。
 * 不调模型；和改写（整句换词）的差别就在「原句保不保」。
 */
export function expandByRules(query: string): { expandedQuery: string; addedTerms: string[] } {
  const added = new Set<string>();
  for (const tok of tokenizeForExpansion(query)) {
    const cleaned = tok.replace(/[，。？?！!、,.；;：:]/g, "");
    const hits = RULE_TERMS[cleaned];
    if (hits) {
      for (const term of hits) added.add(term);
    }
  }
  const addedTerms = [...added];
  const expandedQuery = addedTerms.length > 0 ? query + " " + addedTerms.join(" ") : query;
  return { expandedQuery, addedTerms };
}

export function expandAndRetrieve(query: string): ExpandAndRetrieveResult {
  const t0 = Date.now();
  logger.info(
    "调用函数-expandAndRetrieve",
    "调用函数开始：expandAndRetrieve",
    "为什么写这条日志：扩展是「原句 + 补词，仍一次检索」，不调模型。当前：即将按规则表补词，再用 step-1 同一套词重叠检索。",
    { 入参: { query } },
  );

  const { expandedQuery, addedTerms } = expandByRules(query);
  const retrieve = retrieveByQuery(expandedQuery);
  const result: ExpandAndRetrieveResult = {
    originalQuery: query,
    expandedQuery,
    addedTerms,
    retrieve,
  };

  logger.info(
    "调用函数-expandAndRetrieve",
    "调用函数结束：expandAndRetrieve",
    "为什么写这条日志：页面要看见「原句 / 扩展句 / addedTerms / 名单」四件是否齐全。当前：补词 + 检索都完成。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      __code:
        "const { expandedQuery, addedTerms } = expandByRules(query);\n" +
        "const retrieve = retrieveByQuery(expandedQuery);\n" +
        "return { originalQuery, expandedQuery, addedTerms, retrieve };",
      字段释义: {
        originalQuery: "用户原句；扩展不改原句",
        expandedQuery: "原句 + addedTerms；仍是同一句检索请求",
        addedTerms: "原句没有、补进来的库用语；空数组 = 规则表全 miss（不会改原句）",
      },
    },
  );
  return result;
}
