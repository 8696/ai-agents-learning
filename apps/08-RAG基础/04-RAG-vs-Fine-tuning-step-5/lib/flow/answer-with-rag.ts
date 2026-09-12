/**
 * 职责：本步核心 —— 检索当前 corpus → 拼 system（按材料 + 引用规则）→ 调模型 → 返回带出处。
 *
 * 数据流：POST /api/rag-mix 入参 → search(question, topK) → 拼 system →
 *       llm.openai.chat.completions.create → 抽 reply content → 返回 { answer, sources, mode: "rag-mix" }
 *
 * 与 step-1 lib/flow/answer-with-rag.ts 的差异：
 *   - 检索的 corpus 是 lib/rag/corpus.ts 的「可变 corpus」（支持 addAnnouncement）
 *   - search.ts 每次调用都基于当前 corpus 实时建索引 —— 改公告后检索立刻跟着变
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

export type RagMixSource = {
  chunkId: string;
  source: string;
  section: string;
  score: number;
  preview: string;
};

export type RagMixResult = {
  answer: string;
  sources: RagMixSource[];
  mode: "rag-mix";
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

export async function answerWithRagMix(input: unknown): Promise<RagMixResult> {
  const { question, topK } = inputSchema.parse(input);

  const llm = getLlm();
  const t0 = Date.now();

  logger.info(
    "│ 调用函数-answerWithRagMix",
    "调用函数开始：answerWithRagMix",
    "为什么写这条日志：A5「混合：改公告后事实跟着变」的检索入口。" +
      " 当前：路由 /api/rag-mix 收到请求；下一步走 search() —— 检索基于当前 corpus（可被 addAnnouncement 改）。",
    { 入参: { question, topK }, __code: "const hits = search(question, topK);" },
  );

  const hits = search(question, topK);

  logger.info(
    "││ 调用函数-search",
    "调用函数结束：search",
    "为什么写这条日志：要把命中的切块 ID / 分数交给拼提示词步骤。当前：检索已返回 topK 切块；下一步拼 system。",
    { 返回值: hits, 耗时ms: 0 },
  );

  const sourcesText = formatSources(hits);
  const systemPrompt = SYSTEM_TEMPLATE(sourcesText);

  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么写这条日志：这是真发网络请求的那一次。当前：system 含「找不到就说库里没有」指令 + 材料；user = question。",
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
    "为什么写这条日志：要把 reply 原文交给路由。当前：await 已返回；下一步抽取 content。",
    {
      返回值: response,
      耗时ms: Date.now() - t0,
      字段释义: { "choices[0].message.content": "模型按当前 corpus 给出的答复（含「依据：」段）" },
    },
  );

  const answer = response.choices[0]?.message?.content?.trim() ?? "";

  const result: RagMixResult = {
    answer,
    sources: hits.map((h) => ({
      chunkId: h.chunkId,
      source: h.source,
      section: h.section,
      score: h.score,
      preview: h.preview,
    })),
    mode: "rag-mix",
    retrieved: hits.length,
  };

  logger.info(
    "│ 调用函数-answerWithRagMix",
    "调用函数结束：answerWithRagMix",
    "为什么写这条日志：路由只认这一层返回值。当前：检索结果 + sources + mode 已封装好；下一步写 ctx.body。",
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );

  return result;
}