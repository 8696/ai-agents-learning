/**
 * 职责：残句补全的模型调用层 —— 多轮摘要 + 残句补全（top 3 候选 + 置信度）。
 * 数据流：historyUsed → 可选 summarizeHistory → 拼 messages → 调 LLM → 解析 candidates（按 confidence 降序）。
 * 本步核心：把 historyUsed 喂给模型，让模型返回 top 3 候选 + 置信度。
 */
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

export type HistoryTurn = { role: "user" | "assistant"; content: string };
export type Candidate = { standalone: string; confidence: number };

/** historyUsed 长度 ≥ 此阈值时触发摘要压缩 */
export const SUMMARIZE_THRESHOLD = 8;

type ModelCall = { provider: string; model: string; messages: Array<{ role: string; content: string }> };

/**
 * 多轮摘要：把长 history 压成 80~120 字摘要，保留实体名。
 * 仅在 historyUsed.length ≥ SUMMARIZE_THRESHOLD 时调用。
 */
export async function summarizeHistory(
  historyUsed: HistoryTurn[],
): Promise<{ summary: string; modelCall: ModelCall }> {
  const llm = getLlm();
  const messages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content:
        "你是多轮对话历史摘要器。把多轮对话压缩成 80~120 字的客观摘要，" +
        "保留实体名（货号 / 订单号 / 商品名 / 政策名）。" +
        "只输出 JSON：{\"summary\": \"...\"}。不要回答用户的问题。",
    },
    {
      role: "user",
      content: historyUsed.map(function (t) { return t.role + "：" + t.content; }).join("\n"),
    },
  ];
  const request = { model: llm.modelA, temperature: 0, messages };

  logger.info(
    "│ 调用模型-多轮摘要",
    "调用模型开始：多轮摘要",
    "为什么写这条日志：history 超过阈值时压成摘要喂给后续残句补全。当前：在 summarizeHistory 里，historyUsed=" + historyUsed.length + " 轮。",
    { 入参: { historyCount: historyUsed.length, request }, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );
  const tModel = Date.now();
  const response = await llm.openai.chat.completions.create(request);
  logger.info(
    "│ 调用模型-多轮摘要",
    "调用模型结束：多轮摘要",
    "为什么写这条日志：要解析 choices[0].message.content 里的 summary 字段。当前：模型已返回。",
    {
      返回值: response,
      耗时ms: Date.now() - tModel,
      字段释义: { "choices[0].message.content": "期望是 { summary: \"...\" } JSON" },
    },
  );

  const content = response.choices[0]?.message?.content ?? "";
  const stripped = content.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("摘要模型没有返回 JSON 对象");
  const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
  const summary = String((parsed as { summary?: unknown }).summary || "").trim();
  if (!summary) throw new Error("summary 是空字符串");
  return { summary, modelCall: { provider: llm.provider, model: llm.modelA, messages } };
}

/**
 * 残句补全：调 LLM 基于 historyUsed + current 生成 top 3 candidates，按 confidence 降序选最高。
 * 模型只输出 JSON，不替用户回答。
 */
export async function resolveResidual(
  query: string,
  historyUsed: HistoryTurn[],
): Promise<{
  candidates: Candidate[];
  summaryUsed: boolean;
  resolveModelCall: ModelCall;
  summaryModelCall?: ModelCall;
}> {
  const llm = getLlm();

  let summaryUsed = false;
  let summaryModelCall: ModelCall | undefined;
  let historySection: string;
  if (historyUsed.length >= SUMMARIZE_THRESHOLD) {
    const summarized = await summarizeHistory(historyUsed);
    historySection = "对话历史摘要：" + summarized.summary;
    summaryUsed = true;
    summaryModelCall = summarized.modelCall;
  } else {
    historySection = "上一轮对话：\n" + historyUsed.map(function (t) { return t.role + "：" + t.content; }).join("\n");
  }

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content:
        "你是多轮对话里的「残句补全器」，不是客服。把用户的口语残句（指代 / 短句）" +
        "结合上一轮对话历史改写成独立问句（standalone query）。" +
        "返回 top 3 候选 + 各自置信度（0~1，按从高到低排序）。" +
        "只输出 JSON：{\"candidates\": [{\"standalone\": \"...\", \"confidence\": 0.95}, ...]}。不要回答用户的问题。",
    },
    {
      role: "user",
      content:
        historySection + "\n\n当前问句：" + query +
        "\n\n请把当前问句改写成 top 3 独立完整问句，保留原意图。",
    },
  ];
  const request = { model: llm.modelA, temperature: 0, messages };

  logger.info(
    "│ 调用模型-残句补全",
    "调用模型开始：残句补全",
    "为什么写这条日志：残句补全是真发网络请求的那一次。当前：historyUsed=" + historyUsed.length + " 轮，summaryUsed=" + summaryUsed + "。",
    { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );
  const tModel = Date.now();
  const response = await llm.openai.chat.completions.create(request);
  logger.info(
    "│ 调用模型-残句补全",
    "调用模型结束：残句补全",
    "为什么写这条日志：要解析 choices[0].message.content 里的 candidates 数组。当前：模型已返回。",
    {
      返回值: response,
      耗时ms: Date.now() - tModel,
      字段释义: { "choices[0].message.content": "期望是 { candidates: [{standalone, confidence}, ...] } JSON" },
    },
  );

  const content = response.choices[0]?.message?.content ?? "";
  const stripped = content.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("残句补全模型没有返回 JSON 对象");
  const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
  const rawCandidates = (parsed as { candidates?: unknown }).candidates;
  if (!Array.isArray(rawCandidates) || rawCandidates.length === 0) {
    throw new Error("残句补全模型没有返回 candidates 数组");
  }

  const candidates: Candidate[] = rawCandidates.map(function (c: unknown) {
    const obj = c as { standalone?: unknown; confidence?: unknown };
    return {
      standalone: String(obj.standalone || "").trim(),
      confidence: typeof obj.confidence === "number" ? obj.confidence : 0,
    };
  }).filter(function (c) { return c.standalone.length > 0; });

  if (candidates.length === 0) throw new Error("残句补全候选全是空字符串");
  candidates.sort(function (a, b) { return b.confidence - a.confidence; });

  return {
    candidates,
    summaryUsed,
    resolveModelCall: { provider: llm.provider, model: llm.modelA, messages },
    summaryModelCall,
  };
}
