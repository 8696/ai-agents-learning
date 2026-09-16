/**
 * 职责：本步核心——第 7 关「压缩与摘要」= 有损压缩 + 摘要不能拿摘要再压。
 * 数据流：① compressSession(text) 调模型把一段对话压成会话摘要 ② mergeFactsToImage(keys) 调模型把多条零碎事实合并成画像
 * 两个函数都把「模型原文 modelRequest + modelResponse + 摘要 / 画像 文本 + 字符数 + 压缩比」全部返回，演示页面能完整展示跟大模型的交互过程。
 *
 * 为什么单独成文件：第 7 关笔记独立写过的三个层次（单轮 → 事实 / 整段 → 会话摘要 / 多条 → 画像）+ 核心取舍（有损代价 + 摘要不要拿摘要再压）。
 * 单轮 → 事实在 step-1 extract-facts.ts 已做；本步只做后两个层次。
 *
 * 设计：
 *   - 摘要从原始素材生成：system prompt 明确告诉模型「基于下面这段对话原文生成摘要，不要参考已经生成的摘要」——满足需求 7 验收 ③
 *   - 压缩比 = 原文长度 / 摘要长度（> 1 表示压缩了）
 *   - diff 提示：模型漏了哪条细节由页面 diff（不是模型自己声明）——让演示页能展示「有损代价」
 */
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

// ── 整段 → 会话摘要 ──
export interface CompressSessionResult {
  type: "session";
  summary: string;
  originalLength: number;
  summaryLength: number;
  compressionRatio: number;     // originalLength / summaryLength，> 1 表示压缩了
  // 完整大模型交互（让演示页面能展示「跟大模型发了什么、它回了什么」）
  modelRequest: unknown;
  modelResponse: unknown;
  /** 模型「漏掉」的细节（演示有损代价的素材）：现在 demo 不做 diff 计算，留 null；页面用原始对照代替 */
  droppedDetails: null;
}

const SESSION_SYSTEM = `你是「会话摘要助手」。基于下面这段用户对话原文，生成一段精炼的会话摘要（不超过 5 行）。

要求：
- 只从原文中提取，不要补充任何原文里没有的信息
- 不要参考任何"已生成的摘要"——你只看到这段原文
- 如果原文里有明显无关的内容（寒暄、跑题），可以省略
- 保留所有重要事实：人名、日期、决定、偏好、特殊事项

返回 JSON: { "summary": "..." }`;

export async function compressSession(text: string): Promise<CompressSessionResult> {
  const t0 = Date.now();
  const originalLength = text.length;
  logger.info(
    "调用函数-compressSession",
    "调用函数开始：compressSession",
    "为什么写这条日志：第 7 关「整段 → 会话摘要」——调模型把一段对话压成 5 行内摘要；system 明确告诉模型「只从原文抽」，避免「摘要被摘要压」。当前：拿到 text。",
    { 入参: { textLength: originalLength }, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );

  const llm = await getLlm();
  const request = {
    model: llm.modelA,
    messages: [
      { role: "system" as const, content: SESSION_SYSTEM },
      { role: "user" as const, content: text },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" as const },
  };
  logger.info(
    "││ 调用模型-compressSession-对话补全",
    "调用模型开始：compressSession 对话补全",
    "为什么写这条日志：真发网络请求的那一次，摘要不拿摘要再压——把原文整段给模型，让它重新生成。当前：request 已拼好。",
    { 入参: request },
  );
  const response = await llm.openai.chat.completions.create(request);

  // 剥 think 块 + 代码围栏
  let content = response.choices?.[0]?.message?.content || '{"summary":""}';
  content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) content = fence[1].trim();
  let parsed: { summary?: string };
  try { parsed = JSON.parse(content); } catch { parsed = { summary: "" }; }
  const summary = (parsed.summary || "").trim();
  const summaryLength = summary.length;
  const compressionRatio = summaryLength > 0 ? Math.round((originalLength / summaryLength) * 100) / 100 : 0;

  logger.info(
    "││ 调用模型-compressSession-对话补全",
    "调用模型结束：compressSession 对话补全",
    `为什么写这条日志：让路由层知道摘要长度 + 压缩比 + 模型返回的原文。当前：摘要 ${summaryLength} 字，压缩比 = ${compressionRatio}。`,
    { 返回值: response, 耗时ms: Date.now() - t0 - (Date.now() - t0), 字段释义: {
      "summary": "模型生成的会话摘要（≤5 行）",
      "originalLength": "原文字符数",
      "summaryLength": "摘要字符数",
      "compressionRatio": "原文 / 摘要，> 1 表示压缩了",
    } },
  );

  return {
    type: "session",
    summary,
    originalLength,
    summaryLength,
    compressionRatio,
    modelRequest: request,
    modelResponse: response,
    droppedDetails: null,
  };
}

// ── 多条 → 画像 ──
export interface CompressImageResult {
  type: "image";
  image: string;
  originalKeys: string[];
  originalFacts: Array<{ key: string; value: unknown }>;
  originalLength: number;
  imageLength: number;
  compressionRatio: number;
  modelRequest: unknown;
  modelResponse: unknown;
  droppedDetails: null;
}

const IMAGE_SYSTEM = `你是「事实画像合并助手」。把下面这 N 条零碎的事实合并成一段连贯的「用户画像」（2-4 段话）。

要求：
- 只从这 N 条事实里提取信息，不要补充任何事实里没有的
- 用「用户……」开头的陈述句式，描述用户的身份、偏好、工作方式等
- 如果 N 条里有矛盾或冲突，保留最新的那条（在「事实」列表里 updated_at 较新的）
- 保留所有重要细节：人名、日期、技术栈、特殊偏好等

返回 JSON: { "image": "..." }`;

/**
 * 把多条零碎事实合并成一段用户画像。
 * 关键点：要从原始事实合并，不要拿摘要再压——满足需求 7 验收 ③。
 */
export async function mergeFactsToImage(
  userId: string,
  keys: string[],
): Promise<CompressImageResult> {
  const t0 = Date.now();
  const { kvListForDisplay } = await import("../db.js");
  const allFacts = kvListForDisplay(userId);

  // 按 keys 过滤 + 保持顺序
  const picked = keys
    .map(function (k) { return allFacts.find(function (r) { return r.key === k; }); })
    .filter(function (r) { return r !== undefined; }) as FactRow[];

  const originalLength = picked.reduce(function (sum, r) { return sum + JSON.stringify(r.value).length; }, 0);
  const factsText = picked.map(function (r) {
    return "- key=" + r.key + " fact=" + (typeof r.value === "object" && r.value && "value" in r.value ? (r.value as { value: unknown }).value : JSON.stringify(r.value));
  }).join("\n");

  logger.info(
    "调用函数-mergeFactsToImage",
    "调用函数开始：mergeFactsToImage",
    `为什么写这条日志：第 7 关「多条 → 画像」——把 ${keys.length} 条零碎事实合并成一段连贯的用户画像；system 明确告诉模型「只从这 N 条抽，不要补充」。当前：拿到 ${picked.length} 条事实。`,
    { 入参: { keys, pickedCount: picked.length }, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );

  const llm = await getLlm();
  const request = {
    model: llm.modelA,
    messages: [
      { role: "system" as const, content: IMAGE_SYSTEM },
      { role: "user" as const, content: "事实：\n" + factsText },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" as const },
  };
  logger.info(
    "││ 调用模型-mergeFactsToImage-对话补全",
    "调用模型开始：mergeFactsToImage 对话补全",
    "为什么写这条日志：真发网络请求的那一次，画像从原始事实合并——不要拿摘要再压。当前：request 已拼好。",
    { 入参: request },
  );
  const response = await llm.openai.chat.completions.create(request);

  let content = response.choices?.[0]?.message?.content || '{"image":""}';
  content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) content = fence[1].trim();
  let parsed: { image?: string };
  try { parsed = JSON.parse(content); } catch { parsed = { image: "" }; }
  const image = (parsed.image || "").trim();
  const imageLength = image.length;
  const compressionRatio = imageLength > 0 ? Math.round((originalLength / imageLength) * 100) / 100 : 0;

  logger.info(
    "││ 调用模型-mergeFactsToImage-对话补全",
    "调用模型结束：mergeFactsToImage 对话补全",
    `为什么写这条日志：让路由层知道画像长度 + 压缩比。当前：画像 ${imageLength} 字，压缩比 = ${compressionRatio}。`,
    { 返回值: response, 耗时ms: Date.now() - t0, 字段释义: {
      "image": "模型生成的用户画像（2-4 段）",
      "originalLength": "原始 N 条事实的 value 字符总数",
      "imageLength": "画像字符数",
      "compressionRatio": "原始长度 / 画像，> 1 表示压缩了",
    } },
  );

  return {
    type: "image",
    image,
    originalKeys: picked.map(function (r) { return r.key; }),
    originalFacts: picked.map(function (r) { return { key: r.key, value: r.value }; }),
    originalLength,
    imageLength,
    compressionRatio,
    modelRequest: request,
    modelResponse: response,
    droppedDetails: null,
  };
}

import type { FactRow } from "../db.js";
