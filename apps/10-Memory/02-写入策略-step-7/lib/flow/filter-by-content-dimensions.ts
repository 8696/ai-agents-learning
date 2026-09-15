/**
 * 本步核心：第 3 关「把关」的内容维度判定——按候选的语义让模型给每条判
 *   isFact（维度 A）：是不是个人事实（不是全员规则 / 程序性记忆）
 *   isCrossSession（维度 B）：跨会话还有用吗（不是本轮临时状态）
 *   isStorageWorth（维度 C）：值不值得占个人事实库（不是公开常识 / 随口感慨）
 *   isPii（维度 P）：是不是敏感信息 / 个人身份信息（合规要求不该存）
 *
 * 职责：拿已经通过置信度阈值的候选清单，让模型给每条判四道维度的通过 / 拦下。
 * 数据流：FilterVerdict[]（来自 filterByConfidence.passed）+ 维度开关 { enableA, enableB, enableC, enablePii }
 *   → 拼 messages（system=四道维度判定规则 + JSON 输出格式；user=候选清单）
 *   → 调协议 A 对话补全（response_format: json_object）
 *   → Zod 校验返回数组（按候选顺序、长度等于输入条数）
 *   → 在原 FilterVerdict 上叠加 rejectReason（PII_DETECTED > PROGRAMMATIC_RULE > SESSION_ONLY > PUBLIC_KNOWLEDGE）或保留 passed=true
 *   → 返回 FilterVerdict[]
 *
 * 为什么四道都由模型判：四道都需要语义理解（"全员规则 vs 个人事实"、"本轮临时 vs 跨会话稳定"、"公开常识 vs 个人事实"、"千真万确的长期事实但不该存"），
 * 正则 / 关键词清单维护成本高、漏判风险大，让模型用语义一次判四道——仍是同一次模型调用，0 额外网络调用。
 *
 * 为什么单独成文件：写入策略八关里第 3 关「把关」有几道独立的判定（置信度、维度 A/B/C/PII、人工确认），
 * 每一道都要单独看日志、单独换实现、单独测。维度 4 把刀放在这一文件里集中管；
 * 后面再加人工确认或换实现时是 lib/flow/ 里加新文件，不是改这个文件。
 */
import { z } from "zod";
import { getLlm } from "../../../../llm.js";
import { logger } from "../logger.js";
import type { FilterVerdict } from "./filter-by-confidence.js";

export interface DimensionsToggle {
  enableA: boolean;
  enableB: boolean;
  enableC: boolean;
  enablePii: boolean;
}

const PII_TYPES = ["id_card", "bank_card", "phone", "health", "religion", "address"] as const;
export type PiiType = (typeof PII_TYPES)[number];

const JudgmentSchema = z.object({
  index: z.number().int().min(0),
  isFact: z.boolean(),
  isCrossSession: z.boolean(),
  isStorageWorth: z.boolean(),
  isPii: z.boolean(),
  /** PII 类别（isPii=true 时必填，false 时填 null）；id_card / bank_card / phone / health / religion / address 六个字符串之一 */
  piiType: z.enum(PII_TYPES).nullable(),
  /** isPii=true 时必须明确写出属于哪一类 PII 及识别理由（一句人话） */
  reasoning: z.string(),
});

const DimensionsResultSchema = z.object({
  judgments: z.array(JudgmentSchema),
});

export type Judgment = z.infer<typeof JudgmentSchema>;

export interface FilterByDimensionsInput {
  candidates: FilterVerdict[];
  toggle: DimensionsToggle;
}

export interface FilterByDimensionsOutput {
  /** 处理过的候选判定（在原 FilterVerdict 上叠加维度判定） */
  verdicts: FilterVerdict[];
  modelRequest: unknown;
  modelResponse: unknown;
}

function buildSystemPrompt(toggle: DimensionsToggle): string {
  const aOn = toggle.enableA;
  const bOn = toggle.enableB;
  const cOn = toggle.enableC;
  const pOn = toggle.enablePii;
  const lines: string[] = [];
  lines.push("你是一个「候选事实把关器」。给你一组已经从原文里抽出来的候选事实（每条带 index / key / value / type），按下面四道维度给每条判「过 / 不过」并写一句理由。");
  lines.push("");
  lines.push("判定的四道维度（开 / 关由调用方决定，开的维度要判，关的维度全部默认 true）：");
  if (aOn) {
    lines.push("维度 A · isFact：是不是「个人事实」，而不是「程序性记忆（全员规则）」");
    lines.push("  - isFact = true：这条是关于这个用户的事实（偏好、技术栈、城市、习惯），不是面向全体的规则");
    lines.push("  - isFact = false：这条是面向全体的规则 / 流程 / 约定 / 工作制度（程序性记忆），不应该进个人事实库");
    lines.push("  - 例：「我们组用 Vue 3」→ isFact=true（这是这个用户的事实）");
    lines.push("       「以后表单校验都用 zod」→ isFact=false（这是全员规则 / 程序性记忆）");
  } else {
    lines.push("维度 A · isFact：开关关闭，所有候选这一维度都按 true 处理");
  }
  if (bOn) {
    lines.push("维度 B · isCrossSession：杀掉进程再启动，这条还有用吗");
    lines.push("  - isCrossSession = true：跨会话稳定存在（偏好、城市、技术栈、长期安排）");
    lines.push("  - isCrossSession = false：本轮临时状态（疲劳 / 算到第几步 / 等我五分钟 / 当前任务进度）");
    lines.push("  - 例：「我今天有点累」→ isCrossSession=false（今天的状态，杀进程之后不存在）");
    lines.push("       「我是深圳的」→ isCrossSession=true（跨会话稳定）");
  } else {
    lines.push("维度 B · isCrossSession：开关关闭，所有候选这一维度都按 true 处理");
  }
  if (cOn) {
    lines.push("维度 C · isStorageWorth：值不值得占个人事实库（不是公开常识 / 随口感慨）");
    lines.push("  - isStorageWorth = true：这条是个人专属的事实（用户的偏好 / 个人经历 / 个人属性），值得占个人库");
    lines.push("  - isStorageWorth = false：这条是公开常识（「北京是首都」「Python 是 Guido 设计的」任何人查得到，该走检索增强生成 RAG 临时查），或随口感慨（「今天天气不错」「好累啊」这种既不是事实、也没人想知道）");
    lines.push("  - 例：「北京是首都」→ isStorageWorth=false（公开常识，Agent 临时 RAG 查一下就行）");
    lines.push("       「我们组用 Vue 3」→ isStorageWorth=true（个人专属技术栈）");
    lines.push("       「今天天气不错」→ isStorageWorth=false（随口感慨）");
  } else {
    lines.push("维度 C · isStorageWorth：开关关闭，所有候选这一维度都按 true 处理");
  }
  if (pOn) {
    lines.push("维度 P · isPii：这条事实是不是「敏感信息 / 个人身份信息」，合规要求不该存进个人事实库");
    lines.push("  - isPii = false：不是 PII，可以存");
    lines.push("  - isPii = true：是 PII（属于以下六类之一），**绝对不能存**：");
    lines.push("       · id_card：身份证号（中国大陆 18 位；含数字 + 末尾 X / x）");
    lines.push("       · bank_card：银行卡号（连续 16~19 位数字）");
    lines.push("       · phone：手机号（11 位数字以 1 开头）");
    lines.push("       · health：健康状况（糖尿病 / 高血压 / 抑郁症 / 癌症 / 精神疾病 / 病史 / 家族遗传病等敏感健康信息）");
    lines.push("       · religion：宗教信仰（佛教 / 基督教 / 伊斯兰教 / 天主教 / 印度教 / 犹太教等）");
    lines.push("       · address：家庭住址（门牌号 / 街道 + 城市组合 / 「我住在 / 我的住址」等具体地址）");
    lines.push("  - 例：「我的身份证号是 110101199001011234」→ isPii=true, piiType=id_card");
    lines.push("       「我有糖尿病」→ isPii=true, piiType=health（糖尿病是敏感健康信息）");
    lines.push("       「我住在北京市朝阳区 XX 路 XX 号」→ isPii=true, piiType=address");
    lines.push("       「我们组用 Vue 3」→ isPii=false（不是 PII）");
    lines.push("       「我下周要体检」→ isPii=false（一次性安排，不是敏感健康）");
  } else {
    lines.push("维度 P · isPii：开关关闭，所有候选这一维度都按 false 处理（即默认不是 PII）");
  }
  lines.push("");
  lines.push("只输出一个 JSON 对象，字段固定为：");
  lines.push('{"judgments": [{"index": 0, "isFact": true|false, "isCrossSession": true|false, "isStorageWorth": true|false, "isPii": true|false, "piiType": "id_card"|"bank_card"|"phone"|"health"|"religion"|"address"|null, "reasoning": "一句话理由"}, ...]}');
  lines.push("按输入候选顺序逐条返回，judgments 数组长度严格等于输入候选条数。isPii=true 时 piiType 必须填对应类别，reasoning 必须明确写出属于哪一类 PII 及识别理由；isPii=false 时 piiType 填 null。");
  return lines.join("\n");
}

function buildUserPrompt(candidates: FilterVerdict[]): string {
  const lines: string[] = [];
  lines.push("候选清单（按顺序逐条判）：");
  candidates.forEach((v, idx) => {
    const c = v.candidate;
    lines.push(`[${idx}] key=${c.key} value=${JSON.stringify(c.value)} type=${c.type} confidence=${c.confidence.toFixed(2)}`);
  });
  return lines.join("\n");
}

/**
 * 推理模型（如 MiniMax-M3）即便开了 JSON Mode，也常在正文前带一段 <think>...</think> 思维链、
 * 并且仍用 ```json ... ``` 包一层。先剥掉这两层再 JSON.parse，否则直接报「不是合法 JSON」。
 * 这里复用 step-1 extract-facts.ts 里同样的处理方式（独立副本，不 import）。
 */
function stripWrap(raw: string): string {
  let s = raw.trim();
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  s = s.replace(/^```(?:json)?\s*\n?/i, "").trim();
  s = s.replace(/\n?```\s*$/i, "").trim();
  return s;
}

export async function filterByContentDimensions(
  input: FilterByDimensionsInput,
): Promise<FilterByDimensionsOutput> {
  const { candidates, toggle } = input;

  if (candidates.length === 0) {
    return { verdicts: [], modelRequest: null, modelResponse: null };
  }
  if (!toggle.enableA && !toggle.enableB && !toggle.enableC && !toggle.enablePii) {
    // 四道维度都关 → 直接把所有候选标 passed=true，不调模型
    return {
      verdicts: candidates.map((v) => ({ ...v, passed: true, rejectReason: undefined })),
      modelRequest: null,
      modelResponse: null,
    };
  }

  const llm = getLlm();
  const messages = [
    { role: "system" as const, content: buildSystemPrompt(toggle) },
    { role: "user" as const, content: buildUserPrompt(candidates) },
  ];
  const request = {
    model: llm.modelA,
    messages,
    response_format: { type: "json_object" as const },
    temperature: 0,
  };

  const t0 = Date.now();
  logger.info(
    "│ 调用模型-内容维度判定",
    "调用模型开始：内容维度判定",
    `为什么写这条日志：这是真发网络请求的那一次，维度 A / B / C / PII 都需要语义理解。当前：拿到 ${candidates.length} 条候选（已过置信度阈值），准备让模型一次性判四道维度。`,
    { 入参: request, __code: "const response = await llm.openai.chat.completions.create(request);" },
  );

  const response = await llm.openai.chat.completions.create(request);
  const durationMs = Date.now() - t0;

  logger.info(
    "│ 调用模型-内容维度判定",
    "调用模型结束：内容维度判定",
    "为什么写这条日志：要把模型返回的 judgments 数组按 index 对齐回原候选，叠加 rejectReason 或保留 passed。当前：await 已返回，下一步 JSON.parse + Zod 校验。",
    {
      返回值: response,
      耗时ms: durationMs,
      字段释义: {
        "choices[0].message.content": "JSON 字符串，含 judgments 数组（按候选顺序，每条带 isFact + isCrossSession + isStorageWorth + isPii + piiType + reasoning 六字段）",
        "choices[0].finish_reason": "stop = 模型认为输出已经完整",
      },
    },
  );

  const content = response.choices[0]?.message?.content ?? "";
  const cleaned = stripWrap(content);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`模型返回的不是合法 JSON（剥掉 think 块 / json 代码围栏后仍解析失败）：${content}`);
  }
  const parsed = DimensionsResultSchema.parse(parsedJson);

  if (parsed.judgments.length !== candidates.length) {
    throw new Error(`模型返回的 judgments 数量 (${parsed.judgments.length}) 与输入候选数 (${candidates.length}) 不一致`);
  }

  // 按 index 对齐到原候选顺序，叠加维度判定
  // 优先级：维度 P (PII) > 维度 A > 维度 B > 维度 C（PII 是合规要求确定性，优先级最高）
  const verdicts: FilterVerdict[] = candidates.map((v, idx) => {
    const j = parsed.judgments[idx];
    if (!j) {
      throw new Error(`模型返回的 judgments 缺少 index=${idx} 的条目`);
    }
    // 开关关闭的维度视为 true（通过）
    const isFact = toggle.enableA ? j.isFact : true;
    const isCrossSession = toggle.enableB ? j.isCrossSession : true;
    const isStorageWorth = toggle.enableC ? j.isStorageWorth : true;
    const isPii = toggle.enablePii ? j.isPii : false;

    let rejectReason: string | undefined;
    if (isPii) {
      rejectReason = "PII_DETECTED";
    } else if (!isFact) {
      rejectReason = "PROGRAMMATIC_RULE";
    } else if (!isCrossSession) {
      rejectReason = "SESSION_ONLY";
    } else if (!isStorageWorth) {
      rejectReason = "PUBLIC_KNOWLEDGE";
    }

    return {
      ...v,
      passed: rejectReason === undefined,
      rejectReason,
    };
  });

  return { verdicts, modelRequest: request, modelResponse: response };
}
