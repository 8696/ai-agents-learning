/**
 * 职责：Listwise（对话模型版）。一次把候选标题 / 摘要塞进上下文，让模型吐 orderedIds。
 * 本步核心：① 拼提示词（一次请求，不是逐条）；② 解析 + **校验 id ⊆ 候选**——漏编号或编造名次 = 失败。
 * 数据流：问句 + 候选 id[] → 拼 messages → 调一次对话补全 → 解析 JSON → 校验 orderedIds。
 * 为什么单独成文件：Listwise 是第二阶段的另一种实现，主路径在 route 里讲不清。
 *
 * 校验不通过 = 不静默采用：返回 { ok: false, validation: { missingInModel, extraInModel } }，
 *   把模型原样输出摆出来，让页面看见「为什么失败」。
 */
import { getLlmOptional } from "../../../../llm.js";
import { getChunkById, type KnowledgeChunk } from "../corpus/knowledge-base.js";
import { logger } from "../logger.js";
import { HttpError } from "../http/send-error.js";

export type ListwiseRow = {
  chunk: KnowledgeChunk;
  newRank: number;
};

export type ListwiseValidation = {
  ok: boolean;
  missingInModel: string[];
  extraInModel: string[];
};

export type ListwiseResult = {
  query: string;
  model: string | null;
  candidateIds: string[];
  orderedIds: string[] | null;
  validation: ListwiseValidation;
  rows: ListwiseRow[];
  rawModelOutput: string;
};

type ParsedShape = { orderedIds?: unknown };

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("模型没有返回可解析的 JSON");
  }
}

function parseOrderedIds(text: string): string[] {
  const raw = extractJsonObject(text) as ParsedShape;
  if (!Array.isArray(raw.orderedIds)) {
    throw new HttpError(502, "Listwise 结果缺 orderedIds 数组", "模型返回值对不上约定形状");
  }
  const out: string[] = [];
  for (const item of raw.orderedIds) {
    if (typeof item === "string") out.push(item);
  }
  return out;
}

function validateIds(orderedIds: string[], candidateIds: string[]): ListwiseValidation {
  const cand = new Set(candidateIds);
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const id of orderedIds) {
    if (cand.has(id) && !seen.has(id)) seen.add(id);
  }
  for (const id of candidateIds) {
    if (!seen.has(id)) missing.push(id);
  }
  const extra = orderedIds.filter((id) => !cand.has(id));
  return {
    ok: missing.length === 0 && extra.length === 0,
    missingInModel: missing,
    extraInModel: extra,
  };
}

function buildOrderedChunks(orderedIds: string[], candidateIds: string[]): ListwiseRow[] {
  const byId = new Map<string, KnowledgeChunk>();
  for (const id of candidateIds) {
    const chunk = getChunkById(id);
    if (chunk) byId.set(id, chunk);
  }
  const rows: ListwiseRow[] = [];
  let rank = 0;
  for (const id of orderedIds) {
    const chunk = byId.get(id);
    if (!chunk) continue;
    rank += 1;
    rows.push({ chunk, newRank: rank });
  }
  return rows;
}

export async function rerankListwiseLlm(query: string, candidateIds: string[]): Promise<ListwiseResult> {
  const t0 = Date.now();
  const llm = getLlmOptional();
  if (!llm) {
    throw new HttpError(503, "未配置模型密钥", "Listwise 需要 LLM 密钥");
  }
  const payload = candidateIds.map((id) => {
    const chunk = getChunkById(id);
    return {
      id,
      title: chunk?.title ?? id,
      snippet: (chunk?.text ?? "").slice(0, 80),
    };
  });

  logger.info(
    "调用函数-rerankListwiseLlm",
    "调用函数开始：rerankListwiseLlm",
    "为什么写这条日志：Listwise 把候选摘要拼成一次请求，里面那次才是真发网络请求。当前：即将拼提示词。",
    {
      入参: { query, candidateIds },
      __code: "const response = await llm.openai.chat.completions.create(request); 再校验 orderedIds ⊆ candidateIds",
    },
  );

  const request = {
    model: llm.modelA,
    temperature: 0,
    messages: [
      {
        role: "system" as const,
        content:
          "你是检索整份名单重排器（Listwise）。给定若干候选的 id + 标题 + 摘要，按「对当前问句的相关性」从高到低输出新顺序。只输出 JSON：{\"orderedIds\":[\"id1\",\"id2\",...]}。",
      },
      {
        role: "user" as const,
        content: [
          `问句：${query}`,
          "候选（id / 标题 / 摘要）：",
          JSON.stringify(payload, null, 2),
          "只输出 orderedIds，且必须包含全部候选 id，**不要**漏编号、**不要**发明桌上没有的 id。",
        ].join("\n"),
      },
    ],
  };

  logger.info(
    "│ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么写这条日志：Listwise 只发一次网络请求，省调用次数；省下来的换上下文窗口压力 + 校验压力。当前：候选已经拼进 messages。",
    { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );

  const tModel = Date.now();
  let response;
  try {
    response = await llm.openai.chat.completions.create(request);
  } catch (error: unknown) {
    logger.error(
      "│ 调用模型-对话补全",
      "调用模型结束：对话补全（失败）",
      "为什么写这条日志：Listwise 模型调用失败要原样留下。当前：没有 orderedIds。",
      { 返回值: error, 耗时ms: Date.now() - tModel },
    );
    throw error;
  }
  const content = response.choices[0]?.message?.content ?? "";
  logger.info(
    "│ 调用模型-对话补全",
    "调用模型结束：对话补全",
    "为什么写这条日志：要解析 orderedIds 并校验 ⊆ 候选。当前：await 已返回。",
    {
      返回值: response,
      耗时ms: Date.now() - tModel,
      字段释义: {
        "choices[0].message.content": "模型给出的 JSON 文本，里面是新顺序的 id 列表",
      },
    },
  );

  const orderedIds = parseOrderedIds(content);
  const validation = validateIds(orderedIds, candidateIds);
  const rows = validation.ok ? buildOrderedChunks(orderedIds, candidateIds) : [];

  const result: ListwiseResult = {
    query,
    model: llm.modelA,
    candidateIds,
    orderedIds,
    validation,
    rows,
    rawModelOutput: content,
  };

  logger.info(
    "调用函数-rerankListwiseLlm",
    "调用函数结束：rerankListwiseLlm",
    "为什么写这条日志：Listwise 完成；校验决定是否采用。当前：orderedIds 与 candidateIds 对照结果。",
    { 返回值: { validation, orderedCount: orderedIds.length, candidateCount: candidateIds.length }, 耗时ms: Date.now() - t0 },
  );
  return result;
}