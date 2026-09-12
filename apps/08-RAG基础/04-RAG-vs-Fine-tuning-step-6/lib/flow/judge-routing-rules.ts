/**
 * 职责：决策模式 1 —— 路由层规则（关键词正则匹配）。
 *
 * 流程：
 *   1. 关键词正则匹配 → 命中 → 走「调 search() + 调 LLM 按材料答」
 *   2. 不命中 → 走「不调 search()，只调 LLM 寒暄」
 *
 * 数据流：POST /api/chat-routing 入参 → judgeRoutingRules() → 返回 { branch, reason, answer, sources? }
 *
 * 为什么先有这一刀：最简单、最可预测 —— 工程师写的规则，每条都能解释「为什么这道题走检索」。
 */
import { logger } from "../logger.js";
import { getLlm } from "../../../../llm.js";
import { search, Hit } from "../rag/search.js";
import { z } from "zod";

const inputSchema = z.object({
  question: z.string().min(1, "问题不能为空"),
  topK: z.number().int().min(1).max(10).optional().default(3),
});

// 命中即视为「业务问题」→ 检索分支；否则 → 寒暄分支
const POLICY_KEYWORDS =
  /(退|换|运费|几天|多久|保修|发票|会员|规则|价|订单|发货|收货|凭证|客服)/;

const SYSTEM_RETRIEVAL = (sources: string) =>
  `你是售后客服助手。请**仅**根据以下材料回答用户问题，并在答复末尾列出依据。\n\n【材料】\n${sources}\n\n要求：\n1. 只回答材料里能找到的事实；找不到就说「库里没有这条信息，我不能编」。\n2. 末尾用「依据：」开头列出引用的切块。`;

const SYSTEM_DIRECT = "你是售后客服助手。简短寒暄即可，不要硬塞政策。";

export type ChatResult = {
  branch: "retrieval" | "direct";
  reason: string;
  answer: string;
  sources?: Array<{ chunkId: string; source: string; section: string; score: number; preview: string }>;
  hits?: Array<{ chunkId: string; source: string; section: string; score: number; preview: string }>;
};

function formatSources(hits: Hit[]): string {
  return hits
    .map(
      (h, i) =>
        `[${i + 1}] ${h.source} / ${h.section} / ${h.chunkId}（相关度 ${h.score}）\n${h.preview}`,
    )
    .join("\n\n");
}

export async function judgeRoutingRules(input: unknown): Promise<ChatResult> {
  const { question, topK } = inputSchema.parse(input);
  const llm = getLlm();

  // ① 路由层判断：关键词命中 → 检索分支
  const hit = POLICY_KEYWORDS.test(question);
  logger.info(
    "│ 调用函数-judgeRoutingRules",
    "调用函数开始：judgeRoutingRules",
    `为什么写这条日志：路由层判断 —— 关键词命中 policy_keywords → 检索 / 直接答。当前：question="${question.slice(0, 20)}…" 命中=${hit}。`,
    { 入参: { question, topK }, __code: "const hit = POLICY_KEYWORDS.test(question);" },
  );

  if (!hit) {
    // 直接答分支
    logger.info(
      "││ 调用模型-对话补全",
      "调用模型开始：对话补全（直接答分支）",
      "为什么写这条日志：关键词未命中 → 不检索 → 直接调模型寒暄。",
      {
        入参: { model: llm.modelA, messages: [{ role: "system", content: SYSTEM_DIRECT }, { role: "user", content: question }] },
        __code: "const response = await llm.openai.chat.completions.create({...});",
      },
    );
    const response = await llm.openai.chat.completions.create({
      model: llm.modelA,
      messages: [
        { role: "system", content: SYSTEM_DIRECT },
        { role: "user", content: question },
      ],
    });
    const answer = response.choices[0]?.message?.content?.trim() ?? "";
    return {
      branch: "direct",
      reason: `关键词未命中（policy_keywords 正则不匹配「${question.slice(0, 12)}…」）→ 不检索 → 直接答`,
      answer,
    };
  }

  // 检索分支
  const hits = search(question, topK);
  const sourcesText = formatSources(hits);
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全（检索分支）",
    `为什么写这条日志：关键词命中 → 检索命中 ${hits.length} 条 → 按材料答。`,
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
    reason: `关键词命中（policy_keywords 正则匹配到「${POLICY_KEYWORDS.exec(question)?.[0]}」）→ 检索分支（命中 ${hits.length} 条）`,
    answer,
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