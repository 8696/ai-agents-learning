/**
 * 职责：HyDE 假想文档嵌入（变体 4）—— 让模型先生成"如果库里有答案，那段大概长这样"的假想段，
 *       再嵌入假想段做向量检索。假想段只用于检索探针，不展示给用户。
 * 数据流：query → 模型生成 hypothetical → 嵌入 hypothetical (type=query) →
 *         cosine vs 预嵌入切块 → top-K。
 * 本步核心：假想段不是客服答复，是检索探针。假想段写飞了 = 检索稳定打到错误类文档。
 *          对照路径（lib/flow/original-embed-search.ts）就是原句直接嵌入检索。
 */
import { getLlm } from "../../../../llm.js";
import { CHUNKS, DEFAULT_QUERY, TARGET_ID } from "../corpus/chunks.js";
import { embedTexts } from "../embed/create-embeddings.js";
import { logger } from "../logger.js";
import { cosineSearch, type VectorRetrieveResult } from "../store/vector-store.js";

const TOP_K = 5;

export type HydeHypotheticalCall = {
  protocol: "A";
  endpoint: "chat.completions.create";
  provider: string;
  model: string;
  temperature: number;
  messages: Array<{ role: "system" | "user"; content: string }>;
};

export type HydeAndRetrieveResult = {
  query: string;
  hypothetical: string;
  /** 假想段向量长度（与切块维度一致） */
  hypVectorDim: number;
  /** 模型调用详情（页面要看见提示词） */
  hypotheticalCall: HydeHypotheticalCall;
  /** HyDE 检索结果（用假想段嵌入做向量检索） */
  hydeRetrieve: VectorRetrieveResult;
};

/**
 * 调模型生成假想政策段：80~150 字的"如果库里有答案，那段大概长这样"。
 * prompt 强制只输出 JSON，避免模型直接答用户问题。
 */
async function generateHypothetical(query: string): Promise<{
  hypothetical: string;
  modelCall: HydeHypotheticalCall;
}> {
  const llm = getLlm();
  const messages: HydeHypotheticalCall["messages"] = [
    {
      role: "system",
      content:
        "你是检索前的假想文档生成器，不是客服。如果知识库有针对该原句的标准答案，那一段大概会怎么写。" +
        "只输出 JSON：{\"hypothetical\": \"80~150 字的政策正文风格段落\"}。" +
        "不要回答用户问题、不要解释、不要列点、不要用『您好』『抱歉』等客服客套。",
    },
    {
      role: "user",
      content: "用户原句：" + query + "\n\n请生成对应的假想政策段（用 JSON）。",
    },
  ];
  const request = {
    model: llm.modelA,
    temperature: 0,
    messages,
  };
  const modelCall: HydeHypotheticalCall = {
    protocol: "A",
    endpoint: "chat.completions.create",
    provider: llm.provider,
    model: llm.modelA,
    temperature: 0,
    messages,
  };

  logger.info(
    "│ 调用模型-生成假想段",
    "调用模型开始：生成假想段",
    "为什么写这条日志：假想段是真发网络请求的那一次。当前：在 hydeAndRetrieve 里，即将调 chat.completions.create。",
    { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );
  const tModel = Date.now();
  const response = await llm.openai.chat.completions.create(request);
  logger.info(
    "│ 调用模型-生成假想段",
    "调用模型结束：生成假想段",
    "为什么写这条日志：要解析 choices[0].message.content 里的 JSON。当前：模型已返回。",
    {
      返回值: response,
      耗时ms: Date.now() - tModel,
      字段释义: { "choices[0].message.content": "期望是 { hypothetical: \"...\" } JSON" },
    },
  );

  const content = response.choices[0]?.message?.content ?? "";
  const stripped = content
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("假想段模型没有返回 JSON 对象");
  }
  const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
  if (typeof parsed !== "object" || parsed === null || !("hypothetical" in parsed)) {
    throw new Error("假想段 JSON 缺少 hypothetical 字段");
  }
  const hypothetical = String((parsed as { hypothetical: unknown }).hypothetical).trim();
  if (!hypothetical) throw new Error("hypothetical 是空字符串");
  return { hypothetical, modelCall };
}

export async function hydeAndRetrieve(query: string): Promise<HydeAndRetrieveResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-hydeAndRetrieve",
    "调用函数开始：hydeAndRetrieve",
    "为什么写这条日志：HyDE 流程有 3 步（生成假想段 / 嵌入 / 余弦检索）。当前：刚进入，先生成假想段。",
    { 入参: { query } },
  );

  // 1. 生成假想段
  const { hypothetical, modelCall } = await generateHypothetical(query);

  // 2. 嵌入假想段（type=query，与建库 type=db 一致）
  logger.info(
    "│ 调用模型-嵌入假想段",
    "调用模型开始：嵌入假想段",
    "为什么写这条日志：假想段必须转成向量才能和预嵌入切块做余弦。当前：在 hydeAndRetrieve 里，type=query。",
    { 入参: { hypotheticalLen: hypothetical.length } },
  );
  const tEmbed = Date.now();
  const hypVectors = await embedTexts(getLlm(), [hypothetical], "query");
  logger.info(
    "│ 调用模型-嵌入假想段",
    "调用模型结束：嵌入假想段",
    "为什么写这条日志：拿到假想段向量后立刻做余弦检索。当前：嵌入完成。",
    {
      返回值: { vectorLen: hypVectors[0]?.length ?? 0 },
      耗时ms: Date.now() - tEmbed,
      __code: "const hypVectors = await embedTexts(llm, [hypothetical], 'query');",
    },
  );

  // 3. 余弦检索 top-K
  const hydeRetrieve = cosineSearch(hypVectors[0], hypothetical, TOP_K);

  const result: HydeAndRetrieveResult = {
    query,
    hypothetical,
    hypVectorDim: hypVectors[0]?.length ?? 0,
    hypotheticalCall: modelCall,
    hydeRetrieve,
  };

  logger.info(
    "调用函数-hydeAndRetrieve",
    "调用函数结束：hydeAndRetrieve",
    "为什么写这条日志：页面要看见原句 / 假想段 / top-K + cosine 分数 / 目标切块。当前：3 步都完成。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      __code:
        "const { hypothetical, modelCall } = await generateHypothetical(query);\n" +
        "const hypVectors = await embedTexts(llm, [hypothetical], 'query');\n" +
        "const hydeRetrieve = cosineSearch(hypVectors[0], hypothetical, TOP_K);",
      字段释义: {
        hypothetical: "假想政策段；只用于检索探针，不是客服答复",
        hydeRetrieve: "用假想段向量做的 top-K 余弦检索",
        "hydeRetrieve.target": "目标切块（unopened-exception）的 cosine / rank / onTable",
      },
    },
  );
  return result;
}

/**
 * 对照路径：原句直接嵌入 → 向量检索。
 * 不调模型生成假想段；只调嵌入接口做 type=query 嵌入。
 */
export type OriginalEmbedResult = {
  query: string;
  retrieve: VectorRetrieveResult;
};

export async function originalEmbedAndRetrieve(query: string): Promise<OriginalEmbedResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-originalEmbedAndRetrieve",
    "调用函数开始：originalEmbedAndRetrieve",
    "为什么写这条日志：对照路径——原句直接做 type=query 嵌入，跳过假想段。当前：刚进入。",
    { 入参: { query } },
  );

  logger.info(
    "│ 调用模型-嵌入原句",
    "调用模型开始：嵌入原句",
    "为什么写这条日志：对照路径也要调嵌入（type=query）。当前：原句 → 向量。",
    { 入参: { queryLen: query.length } },
  );
  const tEmbed = Date.now();
  const queryVectors = await embedTexts(getLlm(), [query], "query");
  logger.info(
    "│ 调用模型-嵌入原句",
    "调用模型结束：嵌入原句",
    "为什么写这条日志：拿到原句向量立刻做余弦检索。当前：嵌入完成。",
    {
      返回值: { vectorLen: queryVectors[0]?.length ?? 0 },
      耗时ms: Date.now() - tEmbed,
    },
  );

  const retrieve = cosineSearch(queryVectors[0], query, TOP_K);
  const result: OriginalEmbedResult = { query, retrieve };

  logger.info(
    "调用函数-originalEmbedAndRetrieve",
    "调用函数结束：originalEmbedAndRetrieve",
    "为什么写这条日志：原句嵌入检索结束，页面要看见 top-K + cosine 与 HyDE 对照。当前：完成。",
    {
      返回值: result,
      耗时ms: Date.now() - t0,
      __code:
        "const queryVectors = await embedTexts(llm, [query], 'query');\n" +
        "const retrieve = cosineSearch(queryVectors[0], query, TOP_K);",
      字段释义: {
        retrieve: "用原句向量做的 top-K 余弦检索（对照路径，不经假想段）",
      },
    },
  );
  return result;
}

/** 暴露给 /api/corpus 路由用：和 step-1 行为一致 —— 仅返回 8 个切块。 */
export { CHUNKS, TARGET_ID, DEFAULT_QUERY };