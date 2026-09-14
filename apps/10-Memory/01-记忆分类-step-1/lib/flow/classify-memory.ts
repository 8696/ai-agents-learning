/**
 * 本步核心：调大模型这一跳——把一句用户原话判进四类记忆（工作/情景/语义/程序性）里的哪一类，
 * 再判它更适合短期还是长期存储，最后给一句中文理由。
 *
 * 职责：拼好 system + user 两条消息 → 用 JSON Mode 调一次对话补全 → 解析并校验模型返回的 JSON。
 * 数据流：sentence（用户一句原话）
 *   → 拼 messages（system=四类定义+短期长期判定口径，user=这句话本身）
 *   → 调协议 A 对话补全（response_format: json_object）
 *   → JSON.parse(content) → Zod 校验字段（memoryType / term / reason）
 *   → 返回 { classification, modelRequest, modelResponse, durationMs }，完整请求/响应原样交给页面展示。
 *
 * 为什么用调模型而不是本地规则匹配：判类需要理解一句话的语义（是经历还是事实还是规则），
 * 关键词匹配很容易把「今天有点累先到这」误判成事实，必须靠模型的语言理解能力来判断。
 */
import { z } from "zod";
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";

export const MEMORY_TYPES = ["工作记忆", "情景记忆", "语义记忆", "程序性记忆"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

const ClassifyResultSchema = z.object({
  memoryType: z.enum(MEMORY_TYPES),
  term: z.enum(["短期", "长期"]),
  reason: z.string(),
});

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

export type ClassifyResult = z.infer<typeof ClassifyResultSchema>;

export interface ClassifyMemoryOutput {
  sentence: string;
  classification: ClassifyResult;
  /** 完整请求体（含 messages），原样交给页面展示，不做摘要 */
  modelRequest: unknown;
  /** 完整原始响应，原样交给页面展示，不做摘要 */
  modelResponse: unknown;
  durationMs: number;
}

// ── 系统提示词：四类记忆的判定标准 + 短期/长期判定口径（对应小节文档「是什么」§5） ──
const SYSTEM_PROMPT = `你是一个「记忆分类判定器」。任务：给你一句用户说的话，判断它最应该归进下面四类记忆的哪一类，并判断它更适合短期还是长期存储，最后给一句中文理由。

四类记忆（严格按这四个类别名输出，不要新增或改名）：
- 工作记忆：这一次任务里正在用的信息，只在当前这一小段对话里有意义（比如代词指代的内容、临时草稿、算到一半的中间结论）。
- 情景记忆：带具体时间/场景的一次性经历（发生过什么事、做了什么、结果如何）。
- 语义记忆：脱离具体场景、持续成立的事实性结论（用户的身份、技术偏好、公司政策）。
- 程序性记忆：一条通用的做事规则或流程约定，不针对某个具体用户，是「该怎么做」而不是「关于谁的事实」。

短期/长期判定口径：这句话包含的信息，值不值得写进「跨会话都要保留」的存储？值得 = 长期；只对当前这一小段过程有用、或是随口一说的一次性状态 = 短期。

只输出一个 JSON 对象，字段固定为：{"memoryType": "工作记忆|情景记忆|语义记忆|程序性记忆", "term": "短期|长期", "reason": "一句中文理由，说清为什么"}`;

export async function classifyMemory(sentence: string): Promise<ClassifyMemoryOutput> {
  const llm = getLlm();
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: sentence },
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
    `为什么写这条日志：这是真发网络请求的那一次，判类要靠模型理解语义，本地关键词匹配判不准。当前：正在给「${sentence}」判类，用 JSON Mode 约束输出格式。`,
    { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );

  const response = await llm.openai.chat.completions.create(request);
  const durationMs = Date.now() - t0;

  logger.info(
    "│ 调用模型-对话补全",
    "调用模型结束：对话补全",
    "为什么写这条日志：要把 content 解析成结构化判类结果再交回上一层。当前：await 已返回，下一步 JSON.parse + Zod 校验。",
    {
      返回值: response,
      耗时ms: durationMs,
      字段释义: {
        "choices[0].message.content": "JSON 字符串，含 memoryType / term / reason 三个字段",
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
  const classification = ClassifyResultSchema.parse(parsedJson);

  return {
    sentence,
    classification,
    modelRequest: request,
    modelResponse: response,
    durationMs,
  };
}
