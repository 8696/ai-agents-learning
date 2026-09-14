/**
 * 职责：两个 LLM 调用助手——让模型把用户原句拆成 N 条不同说法的检索问句（多路查询专用）；
 *       把父块全文 + 用户原句送给对话补全生成答复（多路查询与父子切块共用）。
 * 数据流：被 lib/flow/multi-query-retrieve.ts 直接调用；不在 route 里出现。
 *
 * 为什么单独成文件：lib/flow/multi-query-retrieve.ts 要 ≤280 行，
 * 两个 chat completions 助手都属于"调大模型"环节，跟"多路编排"无关，可以相邻成文件。
 */
import { getLlmOptional } from "../../../../llm.js";
import { logger } from "../logger.js";
import type {
  ParentFeed,
  ModelRequestTrace,
  ModelResponseTrace,
  QueryVariantsTrace,
} from "./types.js";

type Llm = NonNullable<ReturnType<typeof getLlmOptional>>;

/** 让模型从用户原句生成 N 条不同说法的检索问句（1 次 chat completions 调用）。 */
export async function generateQueryVariants(
  llm: Llm,
  query: string,
  numQueries: number,
): Promise<QueryVariantsTrace> {
  const started = Date.now();
  logger.info(
    " generateQueryVariants",
    "调用函数开始：generateQueryVariants",
    "为什么：用模型把一条问句拆成 N 条不同说法的检索问句；后面各搜再合并。",
    {
      __code: generateQueryVariants.toString(),
      入参: { query, numQueries },
    },
  );

  const prompt =
    `你是售后检索改写助手。下面一句用户原句可能只覆盖一个语义邻域。\n` +
    `请改写出 ${numQueries} 条不同说法的检索问句，覆盖同义词、政策名、相关概念；\n` +
    `一行一条，**只输出 ${numQueries} 行、不要编号、不要解释**。\n\n用户原句：${query}`;
  const messages = [
    { role: "system" as const, content: "你是检索改写助手。" },
    { role: "user" as const, content: prompt },
  ];

  const completion = await llm.openai.chat.completions.create({
    model: llm.modelA,
    messages,
    temperature: 0.3,
  });

  const rawContent = completion.choices[0]?.message?.content ?? "";
  const variants = rawContent
    .split("\n")
    .map((line) => line.replace(/^\s*\d+[\.\)]\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, numQueries);

  const usage = completion.usage;
  const trace: QueryVariantsTrace = {
    model: llm.modelA,
    temperature: 0.3,
    rawContent,
    variants,
    request: { model: llm.modelA, temperature: 0.3, messages, prompt },
    response: {
      rawContent,
      variants,
      finishReason: completion.choices[0]?.finish_reason ?? "unknown",
      usage: usage ? {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      } : undefined,
    },
  };

  logger.info(
    " generateQueryVariants",
    "调用函数结束：generateQueryVariants",
    "为什么：把 N 条检索问句交给主流程。",
    { 返回值: trace, 耗时ms: Date.now() - started },
  );

  return trace;
}

/** 用父块全文 + 用户原句调对话补全生成答复（1 次 chat completions 调用）。 */
export async function generateAnswer(
  llm: Llm,
  query: string,
  parentsFed: ParentFeed[],
): Promise<{
  reply: string;
  model: string;
  modelRequest: ModelRequestTrace;
  modelResponse: ModelResponseTrace;
}> {
  const started = Date.now();
  logger.info(
    " generateAnswer",
    "调用函数开始：generateAnswer",
    "为什么：生成必须读父块全文。",
    {
      __code: generateAnswer.toString(),
      入参: { query, parentsCount: parentsFed.length },
    },
  );

  const materials = parentsFed
    .map((item) => `【${item.id} ${item.title}】\n${item.text}`)
    .join("\n\n");
  const messages = [
    {
      role: "system" as const,
      content:
        "你是售后助手。只根据下面「将喂给模型的父块」回答。" +
        "父块里没有的规则不要编。回答末尾用 [id=父块id] 标出来源。",
    },
    {
      role: "user" as const,
      content: `用户原句：${query}\n\n将喂给模型的父块：\n${materials}`,
    },
  ];

  const completion = await llm.openai.chat.completions.create({
    model: llm.modelA,
    messages,
    temperature: 0,
  });

  const reply = completion.choices[0]?.message?.content ?? "";
  const usage = completion.usage;
  const modelRequest: ModelRequestTrace = {
    model: llm.modelA,
    temperature: 0,
    messages,
  };
  const modelResponse: ModelResponseTrace = {
    finishReason: completion.choices[0]?.finish_reason ?? "unknown",
    content: reply,
    usage: usage ? {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    } : undefined,
  };

  logger.info(
    " generateAnswer",
    "调用函数结束：generateAnswer",
    "为什么：把对话补全的正文交回主流程。",
    { 返回值: { reply, model: llm.modelA }, 耗时ms: Date.now() - started },
  );

  return { reply, model: llm.modelA, modelRequest, modelResponse };
}