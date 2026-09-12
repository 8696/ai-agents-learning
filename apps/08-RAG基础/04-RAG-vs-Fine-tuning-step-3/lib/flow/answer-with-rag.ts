/**
 * 职责：本步核心 1 —— 检索 → 拼提示词 → 调模型 → 返回带出处。
 *
 * 数据流：POST /api/rag 入参 → search(question, topK) → 拼 system（含材料 + 引用规则）
 *       → llm.openai.chat.completions.create → 抽 reply content → 返回 { answer, sources, mode: "rag" }
 *
 * 与 answer-without-rag.ts 对照：同一问句 / 同一模型 / 有材料 / 带出处。这一栏专门演示
 * 「检索增强生成 → 命中切块 → 按材料说话 → 末尾挂依据」 —— 选型对照的「检索」那一面。
 */
import { logger } from "../logger.js";
import { getLlm } from "../../../../llm.js";
import { search, Hit } from "../rag/search.js";
import { z } from "zod";

const inputSchema = z.object({
  question: z.string().min(1, "问题不能为空"),
  topK: z.number().int().min(1).max(10).optional().default(3),
});

const SYSTEM_TEMPLATE = (sources: string) =>
  `你是售后客服助手。请**仅**根据以下材料回答用户问题，并在答复末尾列出依据。

【材料】
${sources}

要求：
1. 只回答材料里能直接找到的事实；找不到就说「库里没有这条信息，我不能编」。
2. 答复末尾用「依据：」开头列出你引用的切块，格式「文件名 / 章节 / chunkId」。
3. 不要在答复里添加材料里没有的细节。`;

export type RagSource = {
  chunkId: string;
  source: string;
  section: string;
  score: number;
  preview: string;
};

export type RagResult = {
  answer: string;
  sources: RagSource[];
  mode: "rag";
  retrieved: number;
};

function formatSources(hits: Hit[]): string {
  return hits
    .map(
      (h, i) =>
        `[${i + 1}] ${h.source} / ${h.section} / ${h.chunkId}（相关度 ${h.score}）\n${h.preview}`,
    )
    .join("\n\n");
}

export async function answerWithRag(input: unknown): Promise<RagResult> {
  const { question, topK } = inputSchema.parse(input);

  const llm = getLlm();
  const t0 = Date.now();

  logger.info(
    "│ 调用函数-answerWithRag",
    "调用函数开始：answerWithRag",
    "为什么写这条日志：右栏「检索增强生成」那一侧的入口；先检索、再拼材料、再问模型。" +
      " 当前：路由 /api/rag 收到请求；下一步走 search()。",
    { 入参: { question, topK }, __code: "const hits = search(question, topK);" },
  );

  const hits = search(question, topK);

  logger.info(
    "││ 调用函数-search",
    "调用函数结束：search",
    "为什么写这条日志：要把命中的切块 ID / 分数交给拼提示词步骤。当前：toy 余弦检索已返回 topK 切块；下一步把它们写进系统提示词。",
    { 返回值: hits, 耗时ms: 0 },
  );

  const sourcesText = formatSources(hits);
  const systemPrompt = SYSTEM_TEMPLATE(sourcesText);

  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么写这条日志：这是真发网络请求的那一次。当前：system 已含材料 + 引用规则，user = question；下一步 await。",
    {
      入参: {
        model: llm.modelA,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
      },
      __code: "const response = await llm.openai.chat.completions.create(request);",
    },
  );

  const response = await llm.openai.chat.completions.create({
    model: llm.modelA,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: question },
    ],
  });

  logger.info(
    "││ 调用模型-对话补全",
    "调用模型结束：对话补全",
    "为什么写这条日志：要把 reply 原文交给路由。当前：await 已返回；下一步抽取 content + 拼 sources。",
    {
      返回值: response,
      耗时ms: Date.now() - t0,
      字段释义: { "choices[0].message.content": "模型按材料给出的答复（含「依据：」段）" },
    },
  );

  const answer = response.choices[0]?.message?.content?.trim() ?? "";

  const result: RagResult = {
    answer,
    sources: hits.map((h) => ({
      chunkId: h.chunkId,
      source: h.source,
      section: h.section,
      score: h.score,
      preview: h.preview,
    })),
    mode: "rag",
    retrieved: hits.length,
  };

  logger.info(
    "│ 调用函数-answerWithRag",
    "调用函数结束：answerWithRag",
    "为什么写这条日志：路由只认这一层返回值。当前：右栏结果 + sources 已封装好；下一步写 ctx.body。",
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );

  return result;
}