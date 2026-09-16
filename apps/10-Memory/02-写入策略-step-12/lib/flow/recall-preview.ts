/**
 * 职责：变体 7-E「跨会话验证 + 记忆调取预览」——演示「库里的记忆拼进 prompt + 大模型真能基于记忆说话」。
 *
 * 数据流（两个对照函数）：
 *   recallPreview(userId, userQuestion) — 调记忆
 *     → kvListForDisplay(userId) → 找出 user_profile_auto 的 summary + chat_session_v1 的 value + summary
 *     → 拼成 messages：
 *        system: 你是「基于记忆的 Agent」，用户刚问你：[userQuestion]，请基于素材回答
 *        user:   三层素材（综合层画像 / 对话原文 / 对话摘要）
 *     → 调大模型生成 answer
 *     → 返 { materials, modelRequest, modelResponse, answer, userQuestion }
 *
 *   recallPreviewNoMemory(userQuestion) — 不调记忆（对照组）
 *     → 不读库
 *     → 拼成 messages：
 *        system: 你是 Agent，用户刚问你：[userQuestion]，请直接回答（不依赖任何外部信息）
 *        user:   [userQuestion]
 *     → 调大模型生成 answer
 *     → 返 { modelRequest, modelResponse, answer, userQuestion }
 *
 * 为什么单独成文件：本步核心是「把库里的记忆拼成 prompt + 让模型回答用户问题」——不是压缩、不是自动合并。
 * 文件头写「本步核心」。
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
  /** 大模型基于素材生成的回答 */
  answer: string;
  /** 用户在「新会话」里问的问题 */
  userQuestion: string;
  /** 提示用：素材不全时为什么不全 */
  warnings: string[];
}

export interface RecallPreviewControlResult {
  /** 发给大模型的完整 messages + system（不包含任何素材） */
  modelRequest: unknown;
  /** 大模型返回的完整 response */
  modelResponse: unknown;
  /** 大模型在没拿到记忆时生成的回答 */
  answer: string;
  /** 用户在「新会话」里问的问题（跟调记忆那一组完全相同） */
  userQuestion: string;
}

const SYSTEM_PROMPT_WITH_MEMORY = `你是「基于记忆的 Agent」。下面是关于这个用户的记忆素材：

【1】综合层画像（user_profile_auto.summary）：如果存在，是从多条零碎事实合并出来的整体描述
【2】对话原文（chat_session_v1.value）：用户之前跟你的一段对话原始内容
【3】对话摘要（chat_session_v1.summary）：上面那段对话的摘要

用户刚才在新会话里问你：「{userQuestion}」

要求：
- 优先用素材里的具体细节（时间、地点、人物、过敏、偏好）——这些是新会话里没有、需要记忆才能知道的
- 不要补充任何素材外的内容（不知道就说不知道，不要编）
- 50-200 字，自然像真人回复

返回 JSON: { "answer": "..." }`;

const SYSTEM_PROMPT_NO_MEMORY = `你是 Agent。用户刚在新会话里问你：「{userQuestion}」

这次系统没给你任何关于这个用户的记忆素材（没有画像、没有历史对话、没有摘要）。
请直接回答。

要求：
- 50-200 字，自然像真人回复
- 不依赖任何外部信息——如果用户的问题是「你还记得吗 / 下周怎么样」，你只能回答通用内容
- 不要编造具体细节（不知道就说不知道）

返回 JSON: { "answer": "..." }`;

function stripWrap(content: string): string {
  let c = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = c.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) c = fence[1].trim();
  return c;
}

function parseAnswer(content: string): string {
  const c = stripWrap(content);
  let parsed: { answer?: string };
  try { parsed = JSON.parse(c); } catch { parsed = { answer: "" }; }
  return (parsed.answer || "").trim();
}

export async function recallPreview(userId: string, userQuestion: string): Promise<RecallPreviewResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-recall-preview",
    "调用函数开始：recallPreview",
    "为什么写这条日志：变体 7-E——演示「记忆真的能召回 + 大模型真能基于记忆回答用户问题」。当前：从库里读 user_profile_auto + chat_session_v1，按用户问题拼 prompt。",
    { 入参: { userId, userQuestion }, __code: "const facts = kvListForDisplay(userId);" },
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

  // 拼成 messages：把素材按三层标注清楚 + 把用户问题写进 system 让模型明确知道这是「用户问的」
  const materialsBlock: string[] = [];
  materialsBlock.push(`【1】综合层画像：${imageSummary || "（无）"}`);
  materialsBlock.push(`【2】对话原文：${conversationOriginal ? conversationOriginal.slice(0, 800) + (conversationOriginal.length > 800 ? "...(省略)" : "") : "（无）"}`);
  materialsBlock.push(`【3】对话摘要：${conversationSummary || "（无）"}`);
  const userContent = "记忆素材：\n\n" + materialsBlock.join("\n\n");
  const systemPrompt = SYSTEM_PROMPT_WITH_MEMORY.replace("{userQuestion}", userQuestion);

  const request: { model: string; messages: { role: "system" | "user"; content: string }[]; temperature: number; response_format: { type: "json_object" } } = {
    model: "",
    messages: [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userContent },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" as const },
  };
  const llm = await getLlm();
  request.model = llm.modelA;

  logger.info(
    "││ 调用模型-recall-preview-回答用户问题",
    "调用模型开始：recallPreview 回答用户问题",
    `为什么写这条日志：真发网络请求的那一次，让模型基于素材回答用户问题。当前：userQuestion = "${userQuestion}"；materialsBlock 已拼好（imageSummary = ${imageSummary ? "有" : "无"}, conversationOriginal = ${conversationOriginal ? "有" : "无"}, conversationSummary = ${conversationSummary ? "有" : "无"}）。`,
    { 入参: request },
  );

  const response = await llm.openai.chat.completions.create(request);
  const rawContent = response.choices?.[0]?.message?.content || '{"answer":""}';
  const answer = parseAnswer(rawContent);

  logger.info(
    "││ 调用模型-recall-preview-回答用户问题",
    "调用模型结束：recallPreview 回答用户问题",
    `为什么写这条日志：让前端拿到回答文本 + modelRequest + 模型Response。当前：answer 长度 ${answer.length} 字。`,
    { 返回值: response, 字段释义: {
      "answer": "大模型基于记忆素材 + 用户问题生成的回答",
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
    answer,
    userQuestion,
    warnings,
  };

  logger.info(
    "调用函数-recall-preview",
    "调用函数结束：recallPreview",
    `当前：素材是否齐全 = hasImage ${result.materials.hasImage}, hasConversation ${result.materials.hasConversation}；answer 长度 ${answer.length} 字；warnings ${warnings.length} 条。`,
    { 返回值: { hasImage: result.materials.hasImage, hasConversation: result.materials.hasConversation, answerLength: answer.length, warningsCount: warnings.length }, 耗时ms: Date.now() - t0 },
  );

  return result;
}

export async function recallPreviewNoMemory(userQuestion: string): Promise<RecallPreviewControlResult> {
  const t0 = Date.now();
  logger.info(
    "调用函数-recall-preview-control",
    "调用函数开始：recallPreviewNoMemory",
    "为什么写这条日志：变体 7-E 的对照组——同样用户问题，但不读库、不拼素材，看大模型没拿到记忆时怎么答。当前：拿到 userQuestion。",
    { 入参: { userQuestion }, __code: "llm.chat.completions.create(request)" },
  );

  const systemPrompt = SYSTEM_PROMPT_NO_MEMORY.replace("{userQuestion}", userQuestion);
  const request: { model: string; messages: { role: "system" | "user"; content: string }[]; temperature: number; response_format: { type: "json_object" } } = {
    model: "",
    messages: [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userQuestion },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" as const },
  };
  const llm = await getLlm();
  request.model = llm.modelA;

  logger.info(
    "││ 调用模型-recall-preview-control-无记忆回答",
    "调用模型开始：recallPreviewNoMemory 无记忆回答",
    `为什么写这条日志：对照组真发网络请求的那一次，不带任何素材。当前：userQuestion = "${userQuestion}"。`,
    { 入参: request },
  );

  const response = await llm.openai.chat.completions.create(request);
  const rawContent = response.choices?.[0]?.message?.content || '{"answer":""}';
  const answer = parseAnswer(rawContent);

  logger.info(
    "││ 调用模型-recall-preview-control-无记忆回答",
    "调用模型结束：recallPreviewNoMemory 无记忆回答",
    `为什么写这条日志：让前端拿到无记忆时的回答文本。当前：answer 长度 ${answer.length} 字。`,
    { 返回值: response, 字段释义: {
      "answer": "大模型没拿到记忆时对用户问题的回答（对照组）",
    } },
  );

  const result: RecallPreviewControlResult = {
    modelRequest: request,
    modelResponse: response,
    answer,
    userQuestion,
  };

  logger.info(
    "调用函数-recall-preview-control",
    "调用函数结束：recallPreviewNoMemory",
    `当前：answer 长度 ${answer.length} 字（对照组——和调记忆那一组用同一个 userQuestion）。`,
    { 返回值: { answerLength: answer.length }, 耗时ms: Date.now() - t0 },
  );

  return result;
}
