/**
 * 职责：一句拆成子问题（变体 6）—— 调模型把 query 拆成多个子问题，
 *       对每个子问题分别检索，再合并名单（去重 score 求和）。
 * 数据流：query → splitSubquestions（调模型）→ 多个子问题 → 各自 retrieveByQuery → mergeRetrieves → 合并名单。
 * 本步核心：一句多问（退货几天、保修几年）必须拆开再分别检索；合并不是平均分，是累加 score。
 *          本步只演示「拆 + 各自检索 + 合并」，不演示完整 Multi-query 的去重 / 重排算法（那是下一节）。
 */
import { getLlm } from "../../../../llm.js";
import { retrieveByQuery, type RetrieveResult, type RankedChunk } from "./rewrite-and-retrieve.js";
import { CHUNKS, TARGET_ID } from "../corpus/chunks.js";
import { logger } from "../logger.js";

/**
 * 拆子问题：调 LLM 把 query 拆成数组。
 * prompt：只输出 JSON：{"subquestions": ["...", "..."]}；不替用户回答。
 */
async function splitSubquestions(query: string): Promise<{
  subquestions: string[];
  splitModelCall: { provider: string; model: string; messages: Array<{ role: string; content: string }> };
}> {
  const llm = getLlm();
  const messages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content:
        "你是子问题拆分器，不是客服。把用户的一问多句拆成可独立检索的多个子问题。" +
        "只输出 JSON：{\"subquestions\": [\"子问题1\", \"子问题2\"]}。不要回答用户的问题。",
    },
    {
      role: "user",
      content: "用户原句：" + query + "\n\n请拆成可独立检索的子问题数组（用 JSON）。",
    },
  ];
  const request = { model: llm.modelA, temperature: 0, messages };

  logger.info(
    "│ 调用模型-拆子问题",
    "调用模型开始：拆子问题",
    "为什么写这条日志：拆子问题是一次真发网络请求，不调就没法拆。当前：在 splitSubquestions 里面，第 1 轮。",
    { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );
  const tModel = Date.now();
  const response = await llm.openai.chat.completions.create(request);
  logger.info(
    "│ 调用模型-拆子问题",
    "调用模型结束：拆子问题",
    "为什么写这条日志：要解析 JSON 里的 subquestions 数组。当前：模型已返回。",
    {
      返回值: response,
      耗时ms: Date.now() - tModel,
      字段释义: { "choices[0].message.content": "期望是 { subquestions: [...] } JSON" },
    },
  );

  const content = response.choices[0]?.message?.content ?? "";
  const stripped = content.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("拆子问题模型没有返回 JSON 对象");
  }
  const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
  const sub = (parsed as { subquestions?: unknown }).subquestions;
  if (!Array.isArray(sub) || sub.length === 0) {
    throw new Error("subquestions 是空或不是数组");
  }
  const subquestions = sub.map(function (s) { return String(s).trim(); }).filter(function (s) { return s.length > 0; });
  return { subquestions, splitModelCall: { provider: llm.provider, model: llm.modelA, messages } };
}

/**
 * 合并多个子问题的检索结果：每个 chunk 在各子问题里累加 score，合并 matchedTerms 去重。
 * 排序：score 降序 + id 字典序兜底；onTable = 合并后 score > 0。
 */
function mergeRetrieves(retrieves: RetrieveResult[]): RetrieveResult {
  const scoreMap = new Map<string, { score: number; matchedTerms: Set<string> }>();
  for (const ret of retrieves) {
    for (const row of ret.ranked) {
      const cur = scoreMap.get(row.id) || { score: 0, matchedTerms: new Set<string>() };
      cur.score += row.score;
      for (const t of row.matchedTerms) cur.matchedTerms.add(t);
      scoreMap.set(row.id, cur);
    }
  }
  const ranked: RankedChunk[] = CHUNKS.map(function (chunk) {
    const merged = scoreMap.get(chunk.id) || { score: 0, matchedTerms: new Set<string>() };
    return {
      id: chunk.id,
      title: chunk.title,
      text: chunk.text,
      score: merged.score,
      rank: null,
      onTable: merged.score > 0,
      isTarget: chunk.isTarget,
      matchedTerms: [...merged.matchedTerms],
    };
  });
  ranked.sort(function (a, b) { return b.score - a.score || a.id.localeCompare(b.id); });
  let nextRank = 1;
  for (const row of ranked) {
    if (row.onTable) row.rank = nextRank++;
  }
  const targetRow = ranked.find(function (r) { return r.id === TARGET_ID; });
  const allTerms: string[] = [];
  for (const ret of retrieves) for (const t of ret.terms) if (!allTerms.includes(t)) allTerms.push(t);
  return {
    queryUsed: retrieves.map(function (r) { return r.queryUsed; }).join(" | "),
    terms: allTerms,
    ranked,
    onTableIds: ranked.filter(function (r) { return r.onTable; }).map(function (r) { return r.id; }),
    target: {
      id: TARGET_ID,
      onTable: Boolean(targetRow && targetRow.onTable),
      rank: targetRow ? targetRow.rank : null,
      score: targetRow ? targetRow.score : 0,
    },
  };
}

export type SubquestionAndRetrieveResult = {
  query: string;
  /** 拆出的子问题（来自模型） */
  subquestions: string[];
  /** 拆子问题的模型调用详情 */
  splitModelCall: { provider: string; model: string; messages: Array<{ role: string; content: string }> };
  /** 每个子问题各自的检索结果 */
  perSub: RetrieveResult[];
  /** 合并后的检索结果 */
  merged: RetrieveResult;
};

export async function subquestionAndRetrieve(query: string, hasLlm: boolean): Promise<SubquestionAndRetrieveResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-subquestionAndRetrieve",
    "调用函数开始：subquestionAndRetrieve",
    "为什么写这条日志：一问多句必须先拆成多个子问题再分别检索。当前：即将调模型拆。",
    { 入参: { query, hasLlm } },
  );

  if (!hasLlm) {
    throw new Error("拆子问题需要 LLM；当前没密钥。请在 apps/.env 配置后再跑。");
  }

  const { subquestions, splitModelCall } = await splitSubquestions(query);
  logger.info(
    "│ 调用函数-splitSubquestions",
    "调用函数结束：splitSubquestions",
    "为什么写这条日志：拆出的子问题数组是核心输入。当前：拆完，即将每个子问题各检索一次。",
    { 返回值: { subquestions } },
  );

  const perSub = subquestions.map(function (sq) { return retrieveByQuery(sq); });
  const merged = mergeRetrieves(perSub);
  const result: SubquestionAndRetrieveResult = {
    query,
    subquestions,
    splitModelCall,
    perSub,
    merged,
  };

  logger.info(
    "调用函数-subquestionAndRetrieve",
    "调用函数结束：subquestionAndRetrieve",
    "为什么写这条日志：合并名单是核心输出，页面要看见每个子问题的检索 + 合并后的总名单。当前：拆 + 检索 + 合并都完成。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      __code:
        "const { subquestions } = await splitSubquestions(query);\n" +
        "const perSub = subquestions.map(sq => retrieveByQuery(sq));\n" +
        "const merged = mergeRetrieves(perSub);",
      字段释义: {
        subquestions: "模型拆出的可独立检索的子问题数组",
        perSub: "每个子问题各自的检索结果",
        merged: "合并后按累加 score 排序的名单（去重 score 求和）",
      },
    },
  );
  return result;
}
