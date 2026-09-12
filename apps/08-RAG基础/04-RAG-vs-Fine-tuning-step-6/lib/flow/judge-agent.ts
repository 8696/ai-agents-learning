/**
 * 职责：决策模式 3 —— 模型自己决定（agent loop 风格）。
 *
 * 流程：
 *   1. 先调一次模型：问「该用户问是否需要检索？请只回答 yes 或 no」
 *   2. 模型答 yes → 检索分支
 *   3. 模型答 no → 直接答分支
 *
 * 数据流：POST /api/chat-agent 入参 → judgeAgentDecide() → 返回 { branch, modelSaid, reason, answer, sources?, hits? }
 *
 * 为什么这是「现代做法」：模型看到用户问「你好」时自己判断「不需要检索」→ 答寒暄；看到「退货几天」时自己判断「需要检索」→ 调 search()。最灵活，但代价是「每次提问都额外调一次模型」。
 */
import { logger } from "../logger.js";
import { getLlm } from "../../../../llm.js";
import { search, Hit } from "../rag/search.js";
import { z } from "zod";

const inputSchema = z.object({
  question: z.string().min(1, "问题不能为空"),
  topK: z.number().int().min(1).max(10).optional().default(3),
});

const JUDGE_SYSTEM = `你是路由层 agent。给定用户问题，判断「是否需要检索外部资料」来回答。

判断标准：
- 业务问题（退货 / 运费 / 保修 / 发票 / 会员等）→ 需要检索
- 闲聊 / 寒暄 / 跟业务无关的话 → 不需要检索

请只回答 yes 或 no，不要解释。`;

const SYSTEM_RETRIEVAL = (sources: string) =>
  `你是售后客服助手。请**仅**根据以下材料回答用户问题，并在答复末尾列出依据。\n\n【材料】\n${sources}\n\n要求：\n1. 只回答材料里能找到的事实；找不到就说「库里没有这条信息，我不能编」。\n2. 末尾用「依据：」开头列出引用的切块。`;

const SYSTEM_DIRECT = "你是售后客服助手。简短寒暄即可，不要硬塞政策。";

export type AgentResult = {
  branch: "retrieval" | "direct";
  modelSaid: "yes" | "no" | "other";
  reason: string;
  answer: string;
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

export async function judgeAgentDecide(input: unknown): Promise<AgentResult> {
  const { question, topK } = inputSchema.parse(input);
  const llm = getLlm();
  const t0 = Date.now();

  // ① 第一轮：让模型自己决定
  logger.info(
    "│ 调用函数-judgeAgentDecide",
    "调用函数开始：judgeAgentDecide",
    "为什么写这条日志：agent loop 第一跳 —— 让模型自己判断「该不该检索」。" +
      ` 当前：question="${question.slice(0, 20)}…"。`,
    { 入参: { question, topK }, __code: "const response = await llm.openai.chat.completions.create({...});" },
  );

  const judgeResponse = await llm.openai.chat.completions.create({
    model: llm.modelA,
    messages: [
      { role: "system", content: JUDGE_SYSTEM },
      { role: "user", content: question },
    ],
  });
  const modelSaidRaw = (judgeResponse.choices[0]?.message?.content ?? "").trim().toLowerCase();
  const modelSaid: "yes" | "no" | "other" = modelSaidRaw.includes("yes")
    ? "yes"
    : modelSaidRaw.includes("no")
    ? "no"
    : "other";

  logger.info(
    "││ 调用模型-对话补全",
    "调用模型结束：判断一跳（agent）",
    `为什么写这条日志：模型判断结果 modelSaid=${modelSaid}（原始="${modelSaidRaw.slice(0, 30)}"）。下一步按 modelSaid 决定是否检索。`,
    { 返回值: { modelSaidRaw: modelSaidRaw.slice(0, 50) }, 耗时ms: Date.now() - t0 },
  );

  // ② 第二轮：按模型决定走分支
  if (modelSaid !== "yes") {
    logger.info(
      "││ 调用模型-对话补全",
      "调用模型开始：对话补全（直接答分支）",
      `为什么写这条日志：模型答 no → 不检索 → 直接答。`,
      {
        入参: {
          model: llm.modelA,
          messages: [
            { role: "system", content: SYSTEM_DIRECT },
            { role: "user", content: question },
          ],
        },
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
      modelSaid,
      reason: `模型自己判断「${modelSaidRaw}」→ 不检索 → 直接答`,
      answer,
    };
  }

  // 模型答 yes → 检索 + 按材料答
  const hits = search(question, topK);
  const sourcesText = formatSources(hits);
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全（检索分支）",
    `为什么写这条日志：模型答 yes → 检索命中 ${hits.length} 条 → 按材料答。`,
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
    modelSaid,
    reason: `模型自己判断「${modelSaidRaw}」→ 检索 → 按材料答（命中 ${hits.length} 条）`,
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