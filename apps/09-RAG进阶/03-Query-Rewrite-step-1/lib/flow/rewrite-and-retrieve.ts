/**
 * 职责：本步核心 —— 同一句日常说法，先按原句做词重叠检索，再调模型改写成库用语后检索。
 * 数据流：query → extractTerms → 与切块 text 做子串命中计分 → 进检索名单(score>0) / 未进检索名单；
 *         rewrite 路径再加一次协议 A 对话补全，用改写句重复检索，并把发给模型的提示词和参数放进 modelCall 给页面。
 * 本步核心：改写发生在检索之前；对照的是「原句名单 vs 改写后名单」，不是精排改顺序。
 */
import { getLlm } from "../../../../llm.js";
import { CHUNKS, TARGET_ID, type Chunk } from "../corpus/chunks.js";
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
      if (/[\u4e00-\u9fff]/.test(gram)) terms.add(gram);
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
    "为什么写这条日志：本步粗检索是本地词重叠，不用嵌入。当前：正按送进来的那串字给 8 个切块打分。",
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
    "为什么写这条日志：页面要看见谁进检索名单、目标切块在不在窗里。当前：词重叠打分完成。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      __code:
        "const terms = extractTerms(query);\n" +
        "const scored = CHUNKS.map(chunk => scoreChunk(terms, chunk));\n" +
        "scored.sort((a, b) => b.score - a.score);\n" +
        "onTable = score > 0;",
      字段释义: {
        onTable: "score>0 才算进检索名单；0 分等于词汇鸿沟：这串字和切块对不上",
        "target.onTable": "false = 该引用的切块没进名单，后面再精排也变不出来",
      },
    },
  );
  return result;
}

function parseRewrittenQuery(raw: string): string {
  const stripped = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("改写模型没有返回 JSON 对象");
  }
  const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
  if (typeof parsed !== "object" || parsed === null || !("rewrittenQuery" in parsed)) {
    throw new Error("改写 JSON 缺少 rewrittenQuery");
  }
  const rewrittenQuery = String((parsed as { rewrittenQuery: unknown }).rewrittenQuery).trim();
  if (!rewrittenQuery) throw new Error("rewrittenQuery 是空字符串");
  return rewrittenQuery;
}

export async function rewriteAndRetrieve(originalQuery: string): Promise<RewriteAndRetrieveResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-rewriteAndRetrieve",
    "调用函数开始：rewriteAndRetrieve",
    "为什么写这条日志：改写必须发生在检索之前。当前：即将调模型换词，里面那次才是真发网络请求。",
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
    "为什么写这条日志：这是真发网络请求的那一次，不用它就没有改写句。当前：在 rewriteAndRetrieve 里面。",
    { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );
  const tModel = Date.now();
  const response = await llm.openai.chat.completions.create(request);
  logger.info(
    "│ 调用模型-对话补全",
    "调用模型结束：对话补全",
    "为什么写这条日志：要用 choices[0].message.content 解析 rewrittenQuery。当前：模型已返回。",
    {
      返回值: response,
      耗时ms: Date.now() - tModel,
      字段释义: {
        "choices[0].message.content": "期望是 { rewrittenQuery } JSON，不是最终客服答复",
      },
    },
  );

  const content = response.choices[0]?.message?.content ?? "";
  const rewrittenQuery = parseRewrittenQuery(content);
  const retrieve = retrieveByQuery(rewrittenQuery);
  const out: RewriteAndRetrieveResult = { originalQuery, rewrittenQuery, modelCall, retrieve };

  logger.info(
    "调用函数-rewriteAndRetrieve",
    "调用函数结束：rewriteAndRetrieve",
    "为什么写这条日志：页面要对照原句和改写句两份名单。当前：改写 + 检索都完成。",
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
