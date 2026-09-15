/**
 * 本步核心：调大模型这一跳——把一段用户对话原文，抽取成 0~N 条结构化候选记忆条目。
 *
 * 职责：拼好 system（提取规则 + 当前日期）+ user（原文）两条消息 → 用 JSON Mode 调一次对话补全
 *       → 解析并校验模型返回的候选清单（每条含 key / value / type / confidence / source / validUntil）。
 * 数据流：text（一段对话原文，可能是好几句话拼在一起）
 *   → 拼 messages（system=提取规则 + 今天的日期，user=这段原文）
 *   → 调协议 A 对话补全（response_format: json_object）
 *   → JSON.parse(content) → Zod 校验 candidates 数组（允许长度为 0）
 *   → 返回 { text, candidates, todayBjt, modelRequest, modelResponse, durationMs }，
 *     完整请求/响应原样交给页面展示。
 *
 * 为什么用调模型而不是正则规则提取：一段原文里哪几句话值得抽成事实、哪几句只是寒暄，
 * 需要理解语义（「你好」抽不出东西是正常结果，不是失败）；固定正则只能抓「我叫 X」这种
 * 极窄的句式，覆盖不了「我们组一直是 Vue 的技术栈」这类换了说法的表达。
 *
 * 为什么要把当前日期塞进 system：候选事实里的 validUntil（有效期）经常是相对时间
 * （「下周三」「这个月底」），模型不知道今天是哪天就只能瞎猜——这是写入策略里
 * 「过期」这一关最容易被漏掉的实现细节，这一步先把日期传进去，把地基打对。
 */
import { z } from "zod";
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

// ── 候选事实的形状：对应小节文档「提取」§2 变体 2-B 六个字段 ──
export const CANDIDATE_TYPES = ["语义记忆", "情景记忆"] as const;
export type CandidateType = (typeof CANDIDATE_TYPES)[number];

const CandidateSchema = z.object({
  key: z.string(),
  value: z.string(),
  type: z.enum(CANDIDATE_TYPES),
  confidence: z.number().min(0).max(1),
  source: z.string(),
  validUntil: z.string().nullable(),
});

const ExtractResultSchema = z.object({
  candidates: z.array(CandidateSchema),
});

export type Candidate = z.infer<typeof CandidateSchema>;
export type ExtractResult = z.infer<typeof ExtractResultSchema>;

export interface ExtractFactsOutput {
  text: string;
  /** 传给模型的今天日期（北京时间），用来推算 validUntil 这类相对时间 */
  todayBjt: string;
  candidates: Candidate[];
  /** 完整请求体（含 messages），原样交给页面展示，不做摘要 */
  modelRequest: unknown;
  /** 完整原始响应，原样交给页面展示，不做摘要 */
  modelResponse: unknown;
  durationMs: number;
}

/**
 * 推理模型（如 MiniMax-M3）即便开了 JSON Mode，也常在正文前带一段 <think>...</think>
 * 思维链、并且仍用 ```json ... ``` 包一层。先剥掉这两层再 JSON.parse，否则直接报「不是合法 JSON」。
 */
function stripWrap(raw: string): string {
  let s = raw.trim();
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  s = s.replace(/^```(?:json)?\s*\n?/i, "").trim();
  s = s.replace(/\n?```\s*$/i, "").trim();
  return s;
}

/** 今天的日期（北京时间，YYYY-MM-DD），给模型算相对时间用 */
function todayBjt(): string {
  const bjt = new Date(Date.now() + 8 * 3600 * 1000);
  const y = bjt.getUTCFullYear();
  const m = String(bjt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(bjt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function buildSystemPrompt(today: string): string {
  return `你是一个「记忆提取器」。任务：给你一段用户对话原文（可能是好几句话拼在一起，也可能只有一句寒暄），从里面抽取 0 到 N 条值得长期记住的候选事实，不要遗漏也不要编造。

今天的日期是 ${today}（北京时间）。原文里如果出现相对时间的说法（比如「下周三」「这个月底」「明天」），请你结合今天的日期换算成具体日期填进 validUntil；没有任何失效时间线索的，validUntil 填 null。

只抽两类候选，字段固定为 type：
- "语义记忆"：脱离具体时间和场景、仍然成立的事实性结论（技术栈、城市、称呼、稳定的偏好）。
- "情景记忆"：带具体时间/场景的一次性经历或安排（做过什么、约了什么事）。

抽取规则（严格遵守）：
1. 原文里纯粹的寒暄、请求（比如「你好」「帮我写个表单」）本身抽不出候选，返回空数组是正常结果，不是失败。
2. 每条候选给一个简短、稳定的 key（同一件事下次再提大概率还是这个 key，比如 "framework" / "city"），一句简短的 value，0~1 之间的 confidence（你对这条判断的把握程度），source（原文里对应哪一句的简短复述），以及前面说的 validUntil。
3. 只依据原文本身，不要把没说过的内容编进候选。
4. 同一段原文可以同时产出语义记忆和情景记忆两类候选，不必只选一类。

只输出一个 JSON 对象，字段固定为：{"candidates": [{"key": "...", "value": "...", "type": "语义记忆|情景记忆", "confidence": 0.0, "source": "...", "validUntil": null 或 "YYYY-MM-DD"}]}`;
}

export async function extractFacts(text: string): Promise<ExtractFactsOutput> {
  const llm = getLlm();
  const today = todayBjt();
  const messages = [
    { role: "system" as const, content: buildSystemPrompt(today) },
    { role: "user" as const, content: text },
  ];
  const request = {
    model: llm.modelA,
    messages,
    response_format: { type: "json_object" as const },
    temperature: 0,
  };

  const t0 = Date.now();
  logger.info(
    "│ 调用模型-对话补全",
    "调用模型开始：对话补全",
    `为什么写这条日志：这是真发网络请求的那一次，提取候选事实要靠模型理解语义，正则规则抓不住换了说法的表达。当前：正在给这段原文做提取，已经把今天的日期（${today}）塞进 system，用 JSON Mode 约束输出格式。`,
    { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );

  const response = await llm.openai.chat.completions.create(request);
  const durationMs = Date.now() - t0;

  logger.info(
    "│ 调用模型-对话补全",
    "调用模型结束：对话补全",
    "为什么写这条日志：要把 content 解析成结构化候选清单再交回上一层。当前：await 已返回，下一步 JSON.parse + Zod 校验（candidates 允许长度为 0）。",
    {
      返回值: response,
      耗时ms: durationMs,
      字段释义: {
        "choices[0].message.content": "JSON 字符串，含 candidates 数组，长度可以是 0",
        "choices[0].finish_reason": "stop = 模型认为输出已经完整",
        usage: "这一次调用消耗的 token 数（prompt + completion）",
      },
    },
  );

  const content = response.choices[0]?.message?.content ?? "";
  const cleaned = stripWrap(content);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch {
    throw new Error(`模型返回的不是合法 JSON（剥掉 <think> / \`\`\`json 后仍解析失败）：${content}`);
  }
  const parsed = ExtractResultSchema.parse(parsedJson);

  return {
    text,
    todayBjt: today,
    candidates: parsed.candidates,
    modelRequest: request,
    modelResponse: response,
    durationMs,
  };
}
