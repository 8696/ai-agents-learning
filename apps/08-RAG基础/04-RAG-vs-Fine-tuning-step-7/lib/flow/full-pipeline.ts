/**
 * 职责：本步核心 —— 检索（基于可变 corpus）+ 拼 system（3 种口吻模板可选）+ 调模型。
 *
 * 数据流：POST /api/full-pipeline 入参 → search(question, topK) → 拼 system
 *       → llm.openai.chat.completions.create → 返回 { answer, sources, systemUsed, fact, tone }
 *
 * 与 step-5 mix sub-page 的差异：
 *   - step-5 mix sub-page 固定一种 system（"先道歉 / 再结论 / 列依据"）
 *   - step-7 full-pipeline 提供 3 种 system 模板（empty / fewshot / brand）切换
 *   - 让学习者直观对比：同一道题，事实来自检索（corpus）、口吻来自 system——两条路各管各的
 *
 * 3 种 system 模板：
 *   - empty：自由发挥（无品牌口吻约定）
 *   - fewshot：3 条客服口吻范例（用 step-2 fewshot-templates 的同款）
 *   - brand：品牌口吻约定「先道歉 / 再结论 / 列依据」+ 2 条范例（本步新增的混合口吻）
 */
import { logger } from "../logger.js";
import { getLlm } from "../../../../llm.js";
import { search, Hit } from "../rag/search.js";
import { z } from "zod";

const inputSchema = z.object({
  question: z.string().min(1, "问题不能为空"),
  topK: z.number().int().min(1).max(10).optional().default(3),
  systemTemplate: z.enum(["empty", "fewshot", "brand"]).default("brand"),
});

const EMPTY_SYSTEM = (sources: string) =>
  `你是售后客服助手。请**仅**根据以下材料回答用户问题，并在答复末尾列出依据。\n\n【材料】\n${sources}\n\n要求：\n1. 只回答材料里能直接找到的事实；找不到就说「库里没有这条信息，我不能编」。\n2. 末尾用「依据：」开头列出引用的切块。`;

// 复用 step-2 那种 fewshot 模板的口吻（少样本）
const FEWSHOT_SYSTEM = (sources: string) =>
  `你是售后客服助手，按以下范例的口吻回答用户问题：\n\n【范例】\n范例 1：用户问鞋开了胶→非常抱歉给困扰，先道歉 → 答复「按现行政策（refund-v2 / 退货总则 / refund-v2-001），质量问题 3 天内可退」，给具体方案。\n范例 2：用户问运费谁出→已查订单 → 答复「运费由我方承担」（refund-v2 / 运费承担 / refund-v2-002）。\n范例 3：用户问便宜一点 → 抱歉让失望 → 答复「如描述与实物显著不符，3 天内无理由退货」（refund-v2 / 退款时效 / refund-v2-003）。\n\n【材料】\n${sources}\n\n要求：\n1. 按范例口吻 + 按材料回答；找不到就说「库里没有这条信息，我不能编」。\n2. 末尾用「依据：」开头列出引用的切块。`;

// 本步新增：品牌口吻约定 + 2 条范例（混合口吻）
const BRAND_SYSTEM = (sources: string) =>
  `你是售后客服助手。\n\n【品牌口吻约定】\n1. 先道歉 / 承认问题（不找借口）\n2. 给具体结论（退 / 换 / 修）\n3. 列依据（材料里能找到的具体条款）\n4. 不用「亲 / 绝对 / 包您满意」等夸张表达\n\n【范例 1】用户问鞋开胶 → "非常抱歉给您带来困扰 —— 三天就开胶确实是质量问题。按现行政策（refund-v2 / 退货总则 / refund-v2-001），质量问题 3 天内可退。我已为您发起退货单，预计 1~2 个工作日上门取件，运费由我方承担。"\n【范例 2】用户问运费谁出 → "运费由我方承担。refund-v2 / 运费承担 / refund-v2-002。"\n\n【材料】\n${sources}\n\n要求：\n1. 按品牌口吻 + 按材料回答；找不到就说「库里没有这条信息，我不能编」。\n2. 末尾用「依据：」开头列出引用的切块。`;

const SYSTEM_BUILDERS = {
  empty: EMPTY_SYSTEM,
  fewshot: FEWSHOT_SYSTEM,
  brand: BRAND_SYSTEM,
};

export type FullPipelineResult = {
  answer: string;
  sources: Array<{ chunkId: string; source: string; section: string; score: number; preview: string }>;
  systemTemplate: "empty" | "fewshot" | "brand";
  fact: string;       // 当前 corpus 的 refund-v2-001 原文（让学习者看到"事实层"）
  tone: string;       // system 模板的描述（让学习者看到"口吻层"）
  hits: Hit[];
};

function formatSources(hits: Hit[]): string {
  return hits
    .map(
      (h, i) =>
        `[${i + 1}] ${h.source} / ${h.section} / ${h.chunkId}（相关度 ${h.score}）\n${h.preview}`,
    )
    .join("\n\n");
}

const TONE_DESC = {
  empty: "自由发挥（无品牌口吻约定）—— step-1 默认风格",
  fewshot: "3 条客服口吻范例（少样本）—— step-2 演示的同款",
  brand: "品牌口吻约定（先道歉 / 再结论 / 列依据） + 2 条范例",
};

export async function fullPipeline(input: unknown): Promise<FullPipelineResult> {
  const { question, topK, systemTemplate } = inputSchema.parse(input);
  const llm = getLlm();

  logger.info(
    "│ 调用函数-fullPipeline",
    "调用函数开始：fullPipeline",
    "为什么写这条日志：step-7 「混合 pipeline」核心 —— 检索当前 corpus + 拼 system + 调模型。" +
      ` 当前：systemTemplate=${systemTemplate}（让学习者看到"事实层 + 口吻层"两条路各管各的）。`,
    { 入参: { question, topK, systemTemplate }, __code: "const hits = search(question, topK);" },
  );

  // ① 事实层：检索（基于当前 corpus —— 可被 /api/corpus-edit 改）
  const hits = search(question, topK);
  const sourcesText = formatSources(hits);
  const systemPrompt = SYSTEM_BUILDERS[systemTemplate](sourcesText);

  // 当前 corpus 的 refund-v2-001（事实层原文）
  const factLayer = hits.find((h) => h.chunkId === "refund-v2-001")?.preview ?? "（当前 corpus 不含 refund-v2-001）";

  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全（混合 pipeline）",
    `为什么写这条日志：这是真发网络请求的那一次。system 含 brand 口吻 + 检索命中 ${hits.length} 条。`,
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
    "调用模型结束：对话补全（混合 pipeline）",
    "为什么写这条日志：要把 reply 原文交给路由。",
    {
      返回值: response,
      字段释义: { "choices[0].message.content": "模型按 system（口吻）+ corpus（事实）答出的完整答复" },
    },
  );

  const answer = response.choices[0]?.message?.content?.trim() ?? "";

  return {
    answer,
    sources: hits.map((h: Hit) => ({
      chunkId: h.chunkId,
      source: h.source,
      section: h.section,
      score: h.score,
      preview: h.preview,
    })),
    systemTemplate,
    fact: factLayer,
    tone: TONE_DESC[systemTemplate],
    hits,
  };
}