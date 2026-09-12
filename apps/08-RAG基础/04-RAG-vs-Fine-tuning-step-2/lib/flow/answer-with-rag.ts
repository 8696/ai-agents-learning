/**
 * 职责：本步核心 —— 检索 → 拼提示词（空 / 少样本 二选一）→ 调模型 → 返回带出处。
 *
 * 数据流：POST /api/rag-{empty|fewshot} 入参 → search(question, topK) → 拼 system
 *       → llm.openai.chat.completions.create → 抽 reply content → 返回 { answer, sources, mode, promptVariant }
 *
 * promptVariant 由路由层决定（路由 = 一个业务 URL 一个文件）：
 *   - "empty"   → routes/rag-empty.ts   → buildEmptySystemPrompt
 *   - "fewshot" → routes/rag-fewshot.ts → buildFewshotSystemPrompt
 *
 * 与 step-1 answer-with-rag.ts 的差异：本 step 加 promptVariant 入参；事实层（搜索 / 拼材料 / 调模型）逻辑保持一致。
 */
import { logger } from "../logger.js";
import { getLlm } from "../../../../llm.js";
import { search, Hit } from "../rag/search.js";
import { buildEmptySystemPrompt, buildFewshotSystemPrompt } from "../rag/fewshot-templates.js";
import { z } from "zod";

const inputSchema = z.object({
  question: z.string().min(1, "问题不能为空"),
  topK: z.number().int().min(1).max(10).optional().default(3),
  promptVariant: z.enum(["empty", "fewshot"]).default("empty"),
});

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
  promptVariant: "empty" | "fewshot";
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
  const { question, topK, promptVariant } = inputSchema.parse(input);

  const llm = getLlm();
  const t0 = Date.now();

  logger.info(
    "│ 调用函数-answerWithRag",
    "调用函数开始：answerWithRag",
    "为什么写这条日志：右栏入口；先检索、再按 promptVariant 拼材料 + 范例、再问模型。" +
      " 当前：路由层收到请求；下一步走 search()。",
    { 入参: { question, topK, promptVariant }, __code: "const hits = search(question, topK);" },
  );

  const hits = search(question, topK);

  logger.info(
    "││ 调用函数-search",
    "调用函数结束：search",
    "为什么写这条日志：要把命中的切块 ID / 分数交给拼提示词步骤。" +
      " 当前：toy 余弦检索已返回 topK 切块；下一步按 variant 拼 system。",
    { 返回值: hits, 耗时ms: 0 },
  );

  const sourcesText = formatSources(hits);
  const systemPrompt =
    promptVariant === "fewshot"
      ? buildFewshotSystemPrompt(sourcesText)
      : buildEmptySystemPrompt(sourcesText);

  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么写这条日志：这是真发网络请求的那一次。" +
      ` 当前：system=${promptVariant}（${promptVariant === "fewshot" ? "带范例" : "空"} + 材料），user = question；下一步 await。`,
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
      字段释义: {
        "choices[0].message.content": `模型按${promptVariant === "fewshot" ? "范例口吻" : "自由发挥"} + 材料给出的答复（含「依据：」段）`,
      },
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
    promptVariant,
    retrieved: hits.length,
  };

  logger.info(
    "│ 调用函数-answerWithRag",
    "调用函数结束：answerWithRag",
    "为什么写这条日志：路由只认这一层返回值。" +
      " 当前：右栏结果 + sources + promptVariant 已封装好；下一步写 ctx.body。",
    { 返回值: result, 耗时ms: Date.now() - t0 },
  );

  return result;
}