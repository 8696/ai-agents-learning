/**
 * 职责：变体 7-E「跨会话验证 + 记忆调取预览」——演示「库里的记忆拼进 prompt + 大模型真能基于记忆说话」。
 * 数据流：
 *   recallPreview(userId)
 *     → kvListForDisplay(userId) → 找出 user_profile_auto 的 summary + chat_session_v1 的 value + summary
 *     → 拼成 messages：
 *        system: 你是「基于记忆的 Agent」，现在要跟用户说话——下面是关于这个用户的记忆素材（画像 + 之前的对话）
 *        user:   请基于这些素材，写一句开场白
 *     → 调大模型生成开场白
 *     → 返 { promptMaterials: { imageSummary, conversationOriginal, conversationSummary }, modelRequest, modelResponse, opening }
 *
 * 为什么单独成文件：本步核心是「把库里的记忆拼成 prompt」——不是压缩、不是自动合并，是「召回 → 拼 prompt → 生成」。文件头写「本步核心」。
 *
 * 与现有步骤的关系：
 *   - lib/flow/compress.ts 已有 compressSession + mergeFactsToImage；本步不复用（本步是「读 + 用」，不是「写 + 压缩」）
 *   - lib/flow/capacity-merge.ts 写 user_profile_auto；本步**读** user_profile_auto
 *   - lib/db.ts 已有 kvListForDisplay；本步复用
 */
import { getLlm } from "../../../../llm.js";
import { kvListForDisplay } from "../db.js";
import { logger } from "../logger.js";

const IMAGE_KEY = "user_profile_auto";
const CONVERSATION_KEY = "chat_session_v1";

export interface PromptMaterials {
  /** 从 user_profile_auto 的 summary 字段取（综合层画像） */
  imageSummary: string | null;
  /** 从 chat_session_v1 的 value.value 字段取（对话原文，事实层） */
  conversationOriginal: string | null;
  /** 从 chat_session_v1 的 summary 字段取（对话摘要） */
  conversationSummary: string | null;
  /** 实际拼进 prompt 的素材是否齐全（用于页面提示"先跑自动合并 /"先灌入示例） */
  hasImage: boolean;
  hasConversation: boolean;
}

export interface RecallPreviewResult {
  /** 拼进 prompt 的素材（让页面亮出「召回了什么」） */
  materials: PromptMaterials;
  /** 发给大模型的完整 messages + system */
  modelRequest: unknown;
  /** 大模型返回的完整 response */
  modelResponse: unknown;
  /** 大模型生成的开场白（直接给用户看的终态） */
  opening: string;
  /** 提示用：素材不全时为什么不全 */
  warnings: string[];
}

const SYSTEM_PROMPT = `你是「基于记忆的 Agent」。下面是关于这个用户的记忆素材：

【1】综合层画像（user_profile_auto.summary）：如果存在，是从多条零碎事实合并出来的整体描述
【2】对话原文（chat_session_v1.value）：用户之前跟你的一段对话原始内容
【3】对话摘要（chat_session_v1.summary）：上面那段对话的摘要

请基于这些素材，写一句「如果现在跟用户说话，开场白会是什么」。

要求：
- 只用素材里的信息，不要补充任何素材外的内容
- 一句话，20-50 字，自然、像真人在打招呼
- 如果素材里有用户名字或工作相关内容，自然带出来（比如「你好，字节跳动的 X」）

返回 JSON: { "opening": "..." }`;

export async function recallPreview(userId: string): Promise<RecallPreviewResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-recall-preview",
    "调用函数开始：recallPreview",
    "为什么写这条日志：变体 7-E——演示「记忆真的能召回 + 大模型真能基于记忆说话」。当前：从库里读 user_profile_auto + chat_session_v1。",
    { 入参: { userId }, __code: "const facts = kvListForDisplay(userId);" },
  );

  const facts = kvListForDisplay(userId);
  const imageRow = facts.find(function (f) { return f.key === IMAGE_KEY; });
  const conversationRow = facts.find(function (f) { return f.key === CONVERSATION_KEY; });

  const warnings: string[] = [];
  const imageSummary = imageRow && imageRow.summary ? imageRow.summary : null;
  const conversationOriginal = conversationRow && conversationRow.value && typeof conversationRow.value === "object" && "value" in (conversationRow.value as Record<string, unknown>)
    ? String((conversationRow.value as Record<string, unknown>).value)
    : null;
  const conversationSummary = conversationRow && conversationRow.summary ? conversationRow.summary : null;

  if (!imageSummary) warnings.push("库里没有 user_profile_auto（先跑一次自动合并：auto-merge 页 → 触发自动合并 → user_profile_auto 写入）");
  if (!conversationOriginal) warnings.push("库里没有 chat_session_v1（先点「灌入示例」写入对话原文）");
  if (!conversationSummary) warnings.push("库里 chat_session_v1 没有 summary（先在 compress-session 页跑一次压缩对话原文）");

  // 拼成 messages：把素材按三层标注清楚，让大模型明确知道每段是哪一层
  const materialsBlock: string[] = [];
  materialsBlock.push(`【1】综合层画像：${imageSummary || "（无）"}`);
  materialsBlock.push(`【2】对话原文：${conversationOriginal ? conversationOriginal.slice(0, 800) + (conversationOriginal.length > 800 ? "...(省略)" : "") : "（无）"}`);
  materialsBlock.push(`【3】对话摘要：${conversationSummary || "（无）"}`);
  const userContent = "记忆素材：\n\n" + materialsBlock.join("\n\n");

  const request = {
    model: "",
    messages: [
      { role: "system" as const, content: SYSTEM_PROMPT },
      { role: "user" as const, content: userContent },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" as const },
  };
  // model 字段从 llm 拿
  const llm = await getLlm();
  (request as { model: string }).model = llm.modelA;

  logger.info(
    "││ 调用模型-recall-preview-对话生成",
    "调用模型开始：recallPreview 对话生成",
    `为什么写这条日志：真发网络请求的那一次，让模型基于素材写开场白。当前：materialsBlock 已拼好（imageSummary = ${imageSummary ? "有" : "无"}, conversationOriginal = ${conversationOriginal ? "有" : "无"}, conversationSummary = ${conversationSummary ? "有" : "无"}）。`,
    { 入参: request },
  );

  const response = await llm.openai.chat.completions.create(request);

  let content = response.choices?.[0]?.message?.content || '{"opening":""}';
  content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) content = fence[1].trim();
  let parsed: { opening?: string };
  try { parsed = JSON.parse(content); } catch { parsed = { opening: "" }; }
  const opening = (parsed.opening || "").trim();

  logger.info(
    "││ 调用模型-recall-preview-对话生成",
    "调用模型结束：recallPreview 对话生成",
    `为什么写这条日志：让前端拿到开场白文本 + modelRequest + 模型Response。当前：opening = ${opening.slice(0, 50)}${opening.length > 50 ? "..." : ""}。`,
    { 返回值: response, 耗时ms: Date.now() - t0 - (Date.now() - t0), 字段释义: {
      "opening": "大模型基于记忆素材生成的开场白",
    } },
  );

  const result: RecallPreviewResult = {
    materials: {
      imageSummary,
      conversationOriginal,
      conversationSummary,
      hasImage: imageSummary !== null,
      hasConversation: conversationOriginal !== null,
    },
    modelRequest: request,
    modelResponse: response,
    opening,
    warnings,
  };

  logger.info(
    "调用函数-recall-preview",
    "调用函数结束：recallPreview",
    `当前：素材是否齐全 = hasImage ${result.materials.hasImage}, hasConversation ${result.materials.hasConversation}；开场白长度 ${opening.length} 字。`,
    { 返回值: { hasImage: result.materials.hasImage, hasConversation: result.materials.hasConversation, openingLength: opening.length }, 耗时ms: Date.now() - t0 },
  );

  return result;
}