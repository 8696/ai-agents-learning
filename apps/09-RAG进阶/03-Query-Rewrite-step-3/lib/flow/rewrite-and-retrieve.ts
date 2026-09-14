/**
 * 职责：精简版检索 + 改写 —— step-3 复用的核心（拷自 step-1 / step-2 精简版）。
 * 数据流：query → 词重叠打分（retrieveByQuery）+ 调模型改写（rewriteAndRetrieve）。
 * 本步核心：变体 11（评测集）+ 变体 12（生成侧）都依赖这两个 flow；不互相 import。
 * 为什么放 lib/flow：评测集 / 生成侧都要拿检索结果；这一份是评测和生成的共同底层。
 */
import { CHUNKS, TARGET_ID, type Chunk } from "../corpus/chunks.js";
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

export type RankedChunk = {
  id: string;
  title: string;
  text: string;
  score: number;
  rank: number | null;
  onTable: boolean;
  isTarget: boolean;
  matchedTerms: string[];
};

export type RetrieveResult = {
  queryUsed: string;
  terms: string[];
  ranked: RankedChunk[];
  onTableIds: string[];
  target: { id: string; onTable: boolean; rank: number | null; score: number };
};

export type RewriteModelCall = {
  protocol: "A";
  endpoint: "chat.completions.create";
  provider: string;
  model: string;
  temperature: number;
  messages: Array<{ role: "system" | "user"; content: string }>;
};

export type RewriteAndRetrieveResult = {
  originalQuery: string;
  rewrittenQuery: string;
  modelCall: RewriteModelCall;
  retrieve: RetrieveResult;
};

function extractTerms(query: string): string[] {
  const cleaned = query.replace(/[，。？?！!、,.；;：:\s]+/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const terms = new Set<string>();
  for (const part of parts) {
    if (part.length >= 2) terms.add(part);
    for (let i = 0; i < part.length - 1; i += 1) {
      const gram = part.slice(i, i + 2);
      if (/[一-鿿]/.test(gram)) terms.add(gram);
    }
  }
  return [...terms];
}

function scoreChunk(terms: string[], chunk: Chunk): { score: number; matchedTerms: string[] } {
  const matchedTerms = terms.filter((term) => chunk.text.includes(term) || chunk.title.includes(term));
  return { score: matchedTerms.length, matchedTerms };
}

export function retrieveByQuery(query: string): RetrieveResult {
  const t0 = Date.now();
  logger.info(
    "调用函数-retrieveByQuery",
    "调用函数开始：retrieveByQuery",
    "为什么写这条日志：评测集和生成侧都需要词重叠检索，不调模型。当前：按 query 给 8 个切块打分。",
    { 入参: { query } },
  );

  const terms = extractTerms(query);
  const scored = CHUNKS.map((chunk) => {
    const { score, matchedTerms } = scoreChunk(terms, chunk);
    return { chunk, score, matchedTerms };
  });
  scored.sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));

  let nextRank = 1;
  const ranked: RankedChunk[] = scored.map((row) => {
    const onTable = row.score > 0;
    const rank = onTable ? nextRank++ : null;
    return {
      id: row.chunk.id,
      title: row.chunk.title,
      text: row.chunk.text,
      score: row.score,
      rank,
      onTable,
      isTarget: row.chunk.isTarget,
      matchedTerms: row.matchedTerms,
    };
  });

  const targetRow = ranked.find((row) => row.id === TARGET_ID);
  const result: RetrieveResult = {
    queryUsed: query,
    terms,
    ranked,
    onTableIds: ranked.filter((row) => row.onTable).map((row) => row.id),
    target: {
      id: TARGET_ID,
      onTable: Boolean(targetRow?.onTable),
      rank: targetRow?.rank ?? null,
      score: targetRow?.score ?? 0,
    },
  };

  logger.info(
    "调用函数-retrieveByQuery",
    "调用函数结束：retrieveByQuery",
    "为什么写这条日志：评测集要看到 top-K 名单，命中的 id 是否在列。当前：打分完成。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      __code:
        "const terms = extractTerms(query);\n" +
        "const scored = CHUNKS.map(chunk => scoreChunk(terms, chunk));\n" +
        "scored.sort((a, b) => b.score - a.score);\n" +
        "onTable = score > 0;",
      字段释义: {
        "ranked[].rank": "score > 0 才进 top-K 名次；score = 0 不上榜",
        "target.onTable": "目标切块（unopened-exception）是否在 top-K 内",
      },
    },
  );
  return result;
}

function parseRewrittenQuery(raw: string): string {
  let stripped = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "") // MiniMax / 部分模型会输出推理块
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  // 1. 先尝试整段解析（最常见：纯 JSON）
  try {
    const parsed: unknown = JSON.parse(stripped);
    if (typeof parsed === "object" && parsed !== null && "rewrittenQuery" in parsed) {
      const v = String((parsed as { rewrittenQuery: unknown }).rewrittenQuery).trim();
      if (v) return v;
    }
  } catch (_e) {
    // fall through to bracket-matching
  }

  // 2. 兜底：在 stripped 里找第一个平衡的 {...}（处理"前导/尾部文本包 JSON"的情况）
  const slice = extractFirstJsonObject(stripped);
  if (!slice) throw new Error("改写模型没有返回 JSON 对象");
  const parsed: unknown = JSON.parse(slice);
  if (typeof parsed !== "object" || parsed === null || !("rewrittenQuery" in parsed)) {
    throw new Error("改写 JSON 缺少 rewrittenQuery");
  }
  const rewrittenQuery = String((parsed as { rewrittenQuery: unknown }).rewrittenQuery).trim();
  if (!rewrittenQuery) throw new Error("rewrittenQuery 是空字符串");
  return rewrittenQuery;
}

/**
 * 在字符串里找第一个平衡的 {...}（按字符扫描，深度计数）。
 * 处理"前导/尾部文本包 JSON"的情况，比如模型在 JSON 前后加注释。
 * 不处理 JSON 字符串内的转义括号（对 rewrittenQuery 这种简单 schema 够用）。
 */
function extractFirstJsonObject(s: string): string | null {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (s[i] === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export async function rewriteAndRetrieve(originalQuery: string): Promise<RewriteAndRetrieveResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-rewriteAndRetrieve",
    "调用函数开始：rewriteAndRetrieve",
    "为什么写这条日志：评测集对照模式和生成侧内部检索都要调改写。当前：即将调模型换词。",
    { 入参: { originalQuery } },
  );

  const llm = getLlm();
  const messages: RewriteModelCall["messages"] = [
    {
      role: "system",
      content:
        "你是检索前的查询改写器，不是客服。把用户的售后口语改成知识库里会出现的检索词，保持同一意图。" +
        "只输出 JSON：{\"rewrittenQuery\":\"用空格分开的几个库用语\"}。不要回答能不能退，不要解释。" +
        "库里常见用语包括：未拆封、超过七日、特例审核、七天无理由、保修、发票、积分。",
    },
    {
      role: "user",
      content: `用户原话：${originalQuery}`,
    },
  ];
  const request = {
    model: llm.modelA,
    temperature: 0,
    messages,
  };
  const modelCall: RewriteModelCall = {
    protocol: "A",
    endpoint: "chat.completions.create",
    provider: llm.provider,
    model: llm.modelA,
    temperature: 0,
    messages,
  };

  logger.info(
    "│ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么写这条日志：改写是真发网络请求的那一次。当前：在 rewriteAndRetrieve 里面。",
    { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );
  const tModel = Date.now();
  const response = await llm.openai.chat.completions.create(request);
  logger.info(
    "│ 调用模型-对话补全",
    "调用模型结束：对话补全",
    "为什么写这条日志：要解析 choices[0].message.content 里的 rewrittenQuery。当前：模型已返回。",
    {
      返回值: response,
      耗时ms: Date.now() - tModel,
    },
  );

  const content = response.choices[0]?.message?.content ?? "";
  const rewrittenQuery = parseRewrittenQuery(content);
  const retrieve = retrieveByQuery(rewrittenQuery);
  const out: RewriteAndRetrieveResult = { originalQuery, rewrittenQuery, modelCall, retrieve };

  logger.info(
    "调用函数-rewriteAndRetrieve",
    "调用函数结束：rewriteAndRetrieve",
    "为什么写这条日志：评测集要看到改写后 top-K；生成侧要拿到检索词拼 prompt。当前：改写 + 检索都完成。",
    {
      返回值: out,
      耗时ms: Date.now() - t0,
      __code:
        "const response = await llm.openai.chat.completions.create(request);\n" +
        "const rewrittenQuery = parseRewrittenQuery(content);\n" +
        "const retrieve = retrieveByQuery(rewrittenQuery);",
    },
  );
  return out;
}