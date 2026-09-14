/**
 * 职责：Pairwise（成对比较）。一次请求只问 A vs B 谁更该回答当前问句。
 * 本步核心：一次只出一道题，不出两个 0～1 假装在比。
 * 数据流：问句 + idA + idB → 按 id 取正文 → 调一次对话补全 → 解析 winner: "A" | "B"。
 */
import { getLlmOptional } from "../../../../llm.js";
import { getChunkById } from "../corpus/knowledge-base.js";
import { logger } from "../logger.js";
import { HttpError } from "../http/send-error.js";

export type PairwiseResult = {
  query: string;
  idA: string;
  idB: string;
  titleA: string;
  titleB: string;
  winner: "A" | "B";
  reason: string;
  model: string | null;
  rawModelOutput: string;
};

type ParsedShape = { winner?: unknown; reason?: unknown };

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

export async function comparePair(query: string, idA: string, idB: string): Promise<PairwiseResult> {
  const t0 = Date.now();
  const llm = getLlmOptional();
  if (!llm) {
    throw new HttpError(503, "未配置模型密钥", "Pairwise 需要 LLM 密钥");
  }
  const chunkA = getChunkById(idA);
  const chunkB = getChunkById(idB);
  if (!chunkA || !chunkB) {
    throw new HttpError(400, "库中找不到 id", "Pairwise 必须是比较库里的两条切块");
  }

  logger.info(
    "调用函数-comparePair",
    "调用函数开始：comparePair",
    "为什么写这条日志：Pairwise 一次只出一道题。当前：即将拼两段正文 + 问句，让模型回 A 或 B。",
    {
      入参: { query, idA, idB },
      __code: "const response = await llm.openai.chat.completions.create(request); 解析 winner: 'A' | 'B'",
    },
  );

  const request = {
    model: llm.modelA,
    temperature: 0,
    messages: [
      {
        role: "system" as const,
        content:
          "你是检索成对比较器（Pairwise）。给定问句 + 两段切块，**只回答** {\"winner\":\"A\"|\"B\",\"reason\":\"一句话\"}。**不要**给两段各打 0～1 分。",
      },
      {
        role: "user" as const,
        content: [
          `问句：${query}`,
          `A（id=${idA}）：`,
          chunkA.title,
          chunkA.text,
          `B（id=${idB}）：`,
          chunkB.title,
          chunkB.text,
          "哪一段更该回答这句问话？只输出 JSON。",
        ].join("\n"),
      },
    ],
  };

  logger.info(
    "│ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么写这条日志：Pairwise 真发网络请求的那一次，里面拿 winner。当前：在 comparePair 里。",
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
      "为什么写这条日志：Pairwise 模型调用失败要原样留下。当前：没有 winner。",
      { 返回值: error, 耗时ms: Date.now() - tModel },
    );
    throw error;
  }
  const content = response.choices[0]?.message?.content ?? "";
  logger.info(
    "│ 调用模型-对话补全",
    "调用模型结束：对话补全",
    "为什么写这条日志：要解析 winner 决定下一步。当前：await 已返回。",
    {
      返回值: response,
      耗时ms: Date.now() - tModel,
      字段释义: {
        "choices[0].message.content": "模型给出的 JSON 文本，里面是 winner / reason",
      },
    },
  );

  const raw = extractJsonObject(content) as ParsedShape;
  if (raw.winner !== "A" && raw.winner !== "B") {
    throw new HttpError(502, "Pairwise 结果 winner 不是 A/B", "模型返回值对不上约定形状");
  }
  const winner = raw.winner;
  const reason = typeof raw.reason === "string" ? raw.reason : "";

  const result: PairwiseResult = {
    query,
    idA,
    idB,
    titleA: chunkA.title,
    titleB: chunkB.title,
    winner,
    reason,
    model: llm.modelA,
    rawModelOutput: content,
  };

  logger.info(
    "调用函数-comparePair",
    "调用函数结束：comparePair",
    "为什么写这条日志：成对比较结束，给学习者「A 赢 / B 赢」的结果 + 一句话理由。当前：不会出两个分数。",
    { 返回值: { winner, reason }, 耗时ms: Date.now() - t0 },
  );
  return result;
}