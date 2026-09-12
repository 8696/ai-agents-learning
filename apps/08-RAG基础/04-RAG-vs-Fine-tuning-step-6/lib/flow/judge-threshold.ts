/**
 * 职责：决策模式 2 —— 关键词 / 命中阈值（top1 score > threshold 才用检索结果）。
 *
 * 流程：
 *   1. 总是调 search(question, topK) → 拿到 hits + 分数
 *   2. top1 score > threshold → 用检索结果（按材料答）
 *   3. top1 score <= threshold → 弃权（说「库里没有」，不答业务问题）
 *
 * 数据流：POST /api/chat-threshold 入参 → judgeThreshold() → 返回 { branch, reason, answer, sources?, hits?, score?, threshold }
 */
import { logger } from "../logger.js";
import { getLlm } from "../../../../llm.js";
import { search, Hit } from "../rag/search.js";
import { z } from "zod";

const inputSchema = z.object({
  question: z.string().min(1, "问题不能为空"),
  topK: z.number().int().min(1).max(10).optional().default(3),
  threshold: z.number().min(0).max(1).optional().default(0.3),
});

const SYSTEM_RETRIEVAL = (sources: string) =>
  `你是售后客服助手。请**仅**根据以下材料回答用户问题，并在答复末尾列出依据。\n\n【材料】\n${sources}\n\n要求：\n1. 只回答材料里能找到的事实；找不到就说「库里没有这条信息，我不能编」。\n2. 末尾用「依据：」开头列出引用的切块。`;

const SYSTEM_ABSTAIN = "你是售后客服助手。库里没有这条信息，请按指令弃权：直接说「库里没有这条信息，我不能编」，不要硬塞政策。";

export type ThresholdResult = {
  branch: "retrieval" | "abstain";
  reason: string;
  answer: string;
  top1Score?: number;
  threshold: number;
  sources?: Array<{ chunkId: string; source: string; section: string; score: number; preview: string }>;
  hits?: Hit[];
};

function formatSources(hits: Hit[]): string {
  return hits
    .map(
      (h, i) =>
        `[${i + 1}] ${h.source} / ${h.section} / ${h.chunkId}（相关度 ${h.score}）\n${h.preview}`,
    )
    .join("\n\n");
}

export async function judgeThreshold(input: unknown): Promise<ThresholdResult> {
  const { question, topK, threshold } = inputSchema.parse(input);
  const llm = getLlm();

  logger.info(
    "│ 调用函数-judgeThreshold",
    "调用函数开始：judgeThreshold",
    `为什么写这条日志：阈值策略 —— 总是检索，看 top1 score 是否过阈值。当前：threshold=${threshold}。`,
    { 入参: { question, topK, threshold }, __code: "const hits = search(question, topK);" },
  );

  const hits = search(question, topK);
  const top1Score = hits[0]?.score ?? 0;

  if (top1Score <= threshold) {
    logger.info(
      "││ 调用模型-对话补全",
      "调用模型开始：对话补全（弃权分支）",
      `为什么写这条日志：top1 score=${top1Score} ≤ threshold=${threshold} → 弃权。`,
      {
        入参: {
          model: llm.modelA,
          messages: [
            { role: "system", content: SYSTEM_ABSTAIN },
            { role: "user", content: question },
          ],
        },
        __code: "const response = await llm.openai.chat.completions.create({...});",
      },
    );
    const response = await llm.openai.chat.completions.create({
      model: llm.modelA,
      messages: [
        { role: "system", content: SYSTEM_ABSTAIN },
        { role: "user", content: question },
      ],
    });
    const answer = response.choices[0]?.message?.content?.trim() ?? "";
    return {
      branch: "abstain",
      reason: `top1 score=${top1Score} ≤ threshold=${threshold} → 弃权（按指令答「库里没有」）`,
      answer,
      top1Score,
      threshold,
      hits,
    };
  }

  // 过阈值 → 用检索结果
  const sourcesText = formatSources(hits);
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全（阈值通过）",
    `为什么写这条日志：top1 score=${top1Score} > threshold=${threshold} → 按材料答。`,
    {
      入参: {
        model: llm.modelA,
        messages: [
          { role: "system", content: SYSTEM_RETRIEVAL(sourcesText) },
          { role: "user", content: question },
        ],
      },
      __code: "const response = await llm.openai.chat.completions.create({...});",
    },
  );
  const response = await llm.openai.chat.completions.create({
    model: llm.modelA,
    messages: [
      { role: "system", content: SYSTEM_RETRIEVAL(sourcesText) },
      { role: "user", content: question },
    ],
  });
  const answer = response.choices[0]?.message?.content?.trim() ?? "";
  return {
    branch: "retrieval",
    reason: `top1 score=${top1Score} > threshold=${threshold} → 用检索结果（命中 ${hits.length} 条）`,
    answer,
    top1Score,
    threshold,
    sources: hits.map((h: Hit) => ({
      chunkId: h.chunkId,
      source: h.source,
      section: h.section,
      score: h.score,
      preview: h.preview,
    })),
    hits,
  };
}