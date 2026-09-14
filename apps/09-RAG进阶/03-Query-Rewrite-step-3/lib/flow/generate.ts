/**
 * 职责：生成侧（变体 12）—— 拼提示词让 LLM 答，user 侧 = 原句、retrieval = 改写句。
 * 数据流：query → 检索（按 retrievalMode 选）→ 拼 prompt → 调 LLM 答。
 * 本步核心：检索用改写句（内部探针），生成侧 user 字段仍放原句（展示给用户的那部分）。
 *          模型回复时引用 [id=xxx]，让用户能回溯到具体切块。
 *
 * 为什么只用 retrievalMode = "original" | "rewritten"：
 *  step-3 不实现 HyDE 嵌入检索（避免在 step-3 重复 step-2 的嵌入 + 向量存储代码）。
 *  HyDE retrieval mode 在 step-2 已有独立 sub-page 演示；本步只覆盖"检索 vs 改写"对照。
 */
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";
import { retrieveByQuery, rewriteAndRetrieve, type RetrieveResult } from "./rewrite-and-retrieve.js";

const TOP_K = 5;

export type RetrievalMode = "original" | "rewritten";

export type GenerateModelCall = {
  protocol: "A";
  endpoint: "chat.completions.create";
  provider: string;
  model: string;
  temperature: number;
  messages: Array<{ role: "system" | "user"; content: string }>;
};

export type GenerateResult = {
  query: string;
  retrievalMode: RetrievalMode;
  /** 实际进入检索的查询串（original=原句 / rewritten=改写句） */
  retrievalQueryUsed: string;
  /** 仅 retrievalMode === "rewritten" 时存在：调改写模型的那次请求（含 system / user / response）*/
  rewriterCall?: {
    request: { model: string; temperature: number; messages: Array<{ role: "system" | "user"; content: string }> };
    response: { rewrittenQuery: string };
  };
  retrieve: RetrieveResult;
  prompt: { system: string; user: string };
  /** 调生成模型的那次请求（page 上要展示给用户看的完整 prompt）*/
  generatorCall: {
    request: { model: string; temperature: number; messages: Array<{ role: "system" | "user"; content: string }> };
    response: { answer: string };
  };
  answer: string;
};

/**
 * 拼提示词：user 字段 = 原句（展示给用户的那部分）；retrieval 单独标注是改写句。
 * 切块标 id + score：模型回复时引用 [id=xxx]，方便用户回溯。
 */
function buildPrompt(opts: {
  query: string;
  retrievalQueryUsed: string;
  retrievalMode: RetrievalMode;
  retrieve: RetrieveResult;
}): { system: string; user: string } {
  const topChunks = opts.retrieve.ranked.slice(0, TOP_K);
  const system =
    "你是售后客服。只基于下列切块回答用户原话。不要编造、不要列点、不要主动延伸。" +
    "引用到的切块在回答末尾用 [id=xxx] 标出（每条引用一行），方便用户回溯。" +
    "如果切块与用户问题无关，请直接说「这个问题不在我们当前知识范围内」。";
  const user =
    `用户原话（请展示给用户）：\n${opts.query}\n\n` +
    `内部检索词（不展示给用户；用于检索的查询串${opts.retrievalMode === "rewritten" ? " —— 已改写" : " —— 原句"}）：\n${opts.retrievalQueryUsed}\n\n` +
    `检索到的切块（top-${TOP_K}，按 score 降序）：\n` +
    topChunks.map((c, i) =>
      `[${i + 1}] id=${c.id} score=${c.score}\n` +
      `${c.title}\n` +
      `${c.text}`,
    ).join("\n\n") +
    `\n\n请根据上述切块回答用户原话。`;
  return { system, user };
}

export async function runGenerate(query: string, retrievalMode: RetrievalMode): Promise<GenerateResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-runGenerate",
    "调用函数开始：runGenerate",
    "为什么写这条日志：变体 12 拼 prompt + 调模型答。当前：即将按 retrievalMode 选检索。",
    { 入参: { query, retrievalMode } },
  );

  // 1. 检索（按 mode 选）
  let retrieve: RetrieveResult;
  let retrievalQueryUsed: string;
  let rewriterCall: GenerateResult["rewriterCall"];
  if (retrievalMode === "original") {
    retrieve = retrieveByQuery(query);
    retrievalQueryUsed = query;
    rewriterCall = undefined;
  } else {
    const r = await rewriteAndRetrieve(query);
    retrieve = r.retrieve;
    retrievalQueryUsed = r.rewrittenQuery;
    // 把调改写模型的那次请求 / 返回包出来，page 上展示
    rewriterCall = {
      request: {
        model: r.modelCall.model,
        temperature: r.modelCall.temperature,
        messages: r.modelCall.messages,
      },
      response: { rewrittenQuery: r.rewrittenQuery },
    };
  }

  // 2. 拼 prompt
  const prompt = buildPrompt({ query, retrievalQueryUsed, retrievalMode, retrieve });

  // 3. 调生成模型
  const llm = getLlm();
  const messages = [
    { role: "system" as const, content: prompt.system },
    { role: "user" as const, content: prompt.user },
  ];
  const request = { model: llm.modelA, temperature: 0, messages };

  logger.info(
    "│ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么写这条日志：生成是真发网络请求的那一次。当前：在 runGenerate 里面。",
    { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );
  const tModel = Date.now();
  const response = await llm.openai.chat.completions.create(request);
  logger.info(
    "│ 调用模型-对话补全",
    "调用模型结束：对话补全",
    "为什么写这条日志：要解析 choices[0].message.content 作为答。当前：模型已返回。",
    {
      返回值: response,
      耗时ms: Date.now() - tModel,
      字段释义: { "choices[0].message.content": "模型答；应包含 [id=xxx] 引用" },
    },
  );

  const answer = response.choices[0]?.message?.content ?? "";
  const result: GenerateResult = {
    query,
    retrievalMode,
    retrievalQueryUsed,
    rewriterCall,
    retrieve,
    prompt,
    generatorCall: { request, response: { answer } },
    answer,
  };

  logger.info(
    "调用函数-runGenerate",
    "调用函数结束：runGenerate",
    "为什么写这条日志：页面要看见完整 prompt + 模型答 + 引用了哪些切块。当前：完成。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      __code:
        "const retrieve = mode === 'original' ? retrieveByQuery(q) : (await rewriteAndRetrieve(q)).retrieve;\n" +
        "const prompt = buildPrompt({ ...retrieve });\n" +
        "const response = await llm.openai.chat.completions.create({ model, temperature: 0, messages });\n" +
        "return { query, retrievalMode, retrievalQueryUsed, retrieve, prompt, modelCall, answer };",
      字段释义: {
        "prompt.user": "用户原句 + 内部检索词 + top-K 切块；user 侧 = 原句",
        "answer": "模型答；末尾用 [id=xxx] 标引用",
      },
    },
  );
  return result;
}