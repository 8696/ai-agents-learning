/**
 * 职责：POST /api/three-way —— 同一份 50 轮假历史，三种策略并行对照。
 *       ① 完整 / ② 滑动窗口 / ③ 摘要压缩 → 一份响应 + 页面 4 张卡对照。
 *
 * 数据流：
 *   浏览器 fetch { turnCount, slidingWindowSize, summarizeFrom, keepRecent, keyFactAtTurn }
 *     → Zod 闸门
 *       → buildMockHistory() 生成 N 轮假对话
 *       → messagesFull      = [system, ...mockHistory, 问句]                                  ← ① 完整
 *       → messagesSliding   = slidingWindowTrim(messagesFull, slidingWindowSize)              ← ② 滑动窗口（按条数 + system pin）
 *       → summary           = summarizeOld(mockHistory.slice(0, summarizeFrom))                ← 调 LLM 做摘要
 *       → messagesSummarize = [system, summary_message, ...mockHistory.slice(summarizeFrom), 问句]  ← ③ 摘要压缩（远期 summary + 近期原文）
 *       → callLlmOnce(messagesFull)      → fullReply                                          ← 调真模型 #1（完整基线）
 *       → callLlmOnce(messagesSliding)   → slidingReply                                       ← 调真模型 #2（滑动窗口）
 *       → callLlmOnce(messagesSummarize) → summarizeReply                                     ← 调真模型 #3（摘要压缩）
 *     → 出参 { full, sliding, summarize }
 *     → React 4 张卡：① 完整（fullReply） ② 滑动窗口（slidingReply） ③ 摘要压缩（summarizeReply） ④ 三方对比小结
 *
 * 教学锚点（模块 06 · 02 · 双策略并跑 · 三方对照）：
 *   - 「丢字面 vs 留语义」= 同一份对话、同一问句、同一模型，唯一变量是 messages 的裁剪策略
 *   - 「三种策略代价一目了然」= 滑动窗口 = 0 额外调用；摘要压缩 = 1 次额外调用；完整 = 0 裁剪但 messages 长
 *   - 「远期摘要 + 近期原文」是生产最常见混合形态 —— step-3 让学习者亲眼看见「摘要压缩 ≠ 滑动窗口」
 *   - 「对比演示页」覆盖需求清单需求 4
 *
 * 实现要点（2026-09-09）：
 *   - 直接复制 step-1 的 slidingWindowTrim + step-2 的 summarizeOld + callLlmOnce（不抽到 lib/，因为重复比抽象便宜）
 *   - 摘要 prompt 与 step-2 同款（含「你是摘要器 / 禁止对话延续 / 给示例」修复踩坑）
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { encode } from "gpt-tokenizer";
import { getLlm } from "../../../llm.js";
import { logger } from "../lib/logger.js";

const bodySchema = z
  .object({
    turnCount: z.number().int().min(2).max(80).default(50),
    slidingWindowSize: z.number().int().min(2).max(80).default(6),
    summarizeFrom: z.number().int().min(1).default(45),
    keepRecent: z.number().int().min(0).default(5),
    keyFactAtTurn: z.number().int().min(1).default(1),
  })
  .refine(v => v.summarizeFrom + v.keepRecent <= v.turnCount, {
    message: "summarizeFrom + keepRecent 不能超过 turnCount",
    path: ["summarizeFrom"],
  });

const SYSTEM_PROMPT =
  "你是一个有帮助的助手。用户会在历史对话里告诉你关于他/她自己的事实（姓名、所在地、偏好等）。" +
  "当用户问「你还记得我叫什么、住哪、最喜欢什么」时，请尽量根据历史对话回答；" +
  "回答要简洁，分点列出你记得的事实即可。";

const KEY_FACT =
  "你好，我先自我介绍一下：我叫 Tina，住在上海，最喜欢的菜是日料，尤其是寿司和拉面。";

const RECALL_QUESTION = "现在问题来了——你还记得我叫什么、住哪、最喜欢吃什么吗？请分点回答。";

const SUMMARIZE_INSTRUCTION =
  "你是一个「对话历史总结器」。下面会给你一段已经结束的对话历史（user 与 assistant 的多轮交流）。\n" +
  "\n" +
  "【你的任务】\n" +
  "用 200 字以内总结这段对话中的关键事实。重点保留：用户的姓名、所在地、偏好、提到过的具体地点或物品。\n" +
  "如果用户在对话中明确告诉过你关于他/她自己的事实，**必须**保留。\n" +
  "\n" +
  "【输出格式】\n" +
  "只输出总结正文（纯文本段落）。禁止：\n" +
  "- 任何前缀（如「以下是总结」「好的」「明白了」）\n" +
  "- 任何对话延续（如「好的，关于 XXX 我先回应」——这不是总结，这是接着说）\n" +
  "- 任何解释 / 注释 / 编号 / 列表符号\n" +
  "\n" +
  "【示例】\n" +
  "输入是一段历史对话，输出应该像：\n" +
  "\"用户自我介绍叫 Tina，住上海，喜欢日料（尤其寿司和拉面）。之后聊过上海天气、推荐电影、拉面馆等话题，还讨论过失眠问题、待办清单等。\"\n" +
  "\n" +
  "现在请总结以下对话历史：";

// ── 与 step-1/2 同款（不重复抽到 lib/）──
function buildMockHistory(turnCount: number, keyFactAtTurn: number): Array<{ role: "user" | "assistant"; content: string }> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  const fillerTopics = [
    "帮我查一下今天上海的天气",
    "今天上海适合穿什么出门",
    "晚上有什么推荐的电影吗",
    "推荐一家评分高的拉面馆",
    "拉面馆人均多少",
    "明天天气怎么样",
    "帮我列一下这周的待办",
    "我最近老失眠怎么办",
    "有什么好听的轻音乐推荐",
    "周末去哪儿玩比较好",
  ];
  for (let i = 1; i <= turnCount; i++) {
    if (i === keyFactAtTurn) {
      out.push({ role: "user", content: KEY_FACT });
      out.push({ role: "assistant", content: "你好 Tina！已记住你住在上海、喜欢日料。有什么我可以帮你的吗？" });
    } else {
      const topic = fillerTopics[(i - 1) % fillerTopics.length];
      out.push({ role: "user", content: `第 ${i} 轮 · ${topic}` });
      out.push({ role: "assistant", content: `好的，关于「${topic}」我先简单回应一下。` });
    }
  }
  return out;
}

function slidingWindowTrim(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  windowSize: number,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const systemMsgs = messages.filter(m => m.role === "system");
  const rest = messages.filter(m => m.role !== "system");
  const tail = rest.slice(-windowSize);
  return [...systemMsgs, ...tail];
}

async function summarizeOld(
  oldMessages: Array<{ role: "user" | "assistant"; content: string }>,
  model: string,
): Promise<string> {
  const transcript = oldMessages
    .map((m, i) => `[${m.role}] (第 ${i + 1} 条)\n${m.content}`)
    .join("\n\n---\n\n");
  const userPrompt =
    "以下是一段历史对话的全文（已结束的对话 · 共 " + oldMessages.length + " 条 · 已被转录成纯文本）：\n\n" +
    transcript +
    "\n\n---\n\n请按 system 指令的要求总结这段历史。";
  const completion = await getLlm().openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SUMMARIZE_INSTRUCTION },
      { role: "user", content: userPrompt },
    ],
  });
  return completion.choices[0]?.message?.content ?? "";
}

async function callLlmOnce(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  model: string,
  stage: "full" | "sliding" | "summarize",
): Promise<string> {
  const request = { model, messages };
  const tokensEstimate = encode(messages.map(m => `${m.role}: ${m.content}`).join("\n")).length;
  const stageZh = stage === "full" ? "完整" : stage === "sliding" ? "滑动窗口" : "摘要压缩";
  logger.info(
    "││ 调用模型-三方对比",
    `调用模型开始：三方对比-${stageZh}`,
    `为什么打：三方对照的关键证据——同一问句同一模型，唯一变量是 messages 裁剪策略。当前：${stageZh}（${stage === "full" ? "基线" : stage === "sliding" ? "K=" + "滑动窗口后" : "summary 后"}）。`,
    {
      入参: request,
      tokensEstimate,
      stage,
      __code: "const completion = await getLlm().openai.chat.completions.create(request);",
    },
  );
  const t0 = Date.now();
  try {
    const completion = await getLlm().openai.chat.completions.create(request);
    const reply = completion.choices[0]?.message?.content ?? "";
    logger.info(
      "││ 调用模型-三方对比",
      `调用模型结束：三方对比-${stageZh}`,
      `为什么打：要把完整 completion 打到日志，对照是否含 key fact。当前：${stageZh} 已返回。`,
      {
        返回值: completion,
        stage,
        replyTokens: encode(reply).length,
        耗时ms: Date.now() - t0,
      },
    );
    return reply;
  } catch (err: unknown) {
    logger.error(
      "││ 调用模型-三方对比",
      `调用模型结束：三方对比-${stageZh}（失败）`,
      `模型调用本身抛错（限流 / 网络 / 超时）；原始错误对象原样进日志。当前：${stageZh} 失败。`,
      { error: err, stage, 入参: request, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
}

export function mountThreeWayRoutes(router: Router): void {
  router.post("/api/three-way", async (ctx: Context) => {
    // ── ① 入参闸门 ──
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: "bad_request", issues: parsed.error.issues };
      logger.warn("three-way.bad_request", "调用函数结束：three-way（失败）", "入参 Zod 没通过；返回 400 给前端", {
        issues: parsed.error.issues,
      });
      return;
    }
    const { turnCount, slidingWindowSize, summarizeFrom, keepRecent, keyFactAtTurn } = parsed.data;

    // ── ② 取 LLM 客户端 ──
    let modelA: string;
    try {
      modelA = getLlm().modelA;
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "no_llm", message: (err as Error).message };
      logger.error("three-way.no_llm", "调用函数结束：three-way（失败）", "getLlm 抛错；apps/.env 没配当前提供商的 Key", {
        error: err,
      });
      return;
    }

    // ── ③ 拼装三份 messages ──
    const mockHistory = buildMockHistory(turnCount, keyFactAtTurn);
    const messagesFull: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...mockHistory,
      { role: "user", content: RECALL_QUESTION },
    ];
    const messagesSliding = slidingWindowTrim(messagesFull, slidingWindowSize);

    const oldForSummary = mockHistory.slice(0, summarizeFrom);
    const recentOriginal = mockHistory.slice(summarizeFrom);

    logger.info("three-way.handler", "调用函数开始：three-way", "为什么打：三方对照是本条核心交付物（需求 4「对比演示页」）。不打完整数据流就讲不清「滑动窗口 vs 摘要压缩」的可观察区别。当前：三份 messages 已拼好（完整 + 滑动 + 待摘要），即将调 4 次模型。", {
      入参: { turnCount, slidingWindowSize, summarizeFrom, keepRecent, keyFactAtTurn, modelA },
      字段释义: {
        "turnCount": "生成的假对话轮数",
        "slidingWindowSize": "滑动窗口 K（保留最近 K 条非 system）",
        "summarizeFrom": "远期 N 条喂给 LLM 做摘要",
        "keepRecent": "近期 K 条留原文",
        "keyFactAtTurn": "key fact 放第几轮",
        "modelA": "来自 apps/.env 顶层 LLM_MODEL 或该家默认",
      },
      __code: "三份 messages 拼装见上方；下一步：调 summarizeOld → 拼 messagesSummarize → 三次 callLlmOnce。",
    });

    // ── ④ 摘要（出网）──
    logger.info("││ 调用模型-对话摘要", "调用函数开始：summarizeOld", "为什么打：纯本地函数包住 LLM 摘要调用；不打就讲不清「摘要压缩的代价」。当前：远期 N 条已切出 + 转录成纯文本。", {
      入参: { summarizeFrom, oldMsgsCount: oldForSummary.length },
      __code: "const summary = await summarizeOld(oldForSummary, modelA);",
    });
    const tSum0 = Date.now();
    let summary = "";
    try {
      summary = await summarizeOld(oldForSummary, modelA);
      logger.info("││ 调用模型-对话摘要", "调用函数结束：summarizeOld", "为什么打：要把 summary 原文打到日志；学习者能直接看到「summary 写进去什么」。", {
        返回值: { summary, summaryTokens: encode(summary).length },
        耗时ms: Date.now() - tSum0,
      });
    } catch (err: unknown) {
      logger.error("││ 调用模型-对话摘要", "调用函数结束：summarizeOld（失败）", "摘要 LLM 抛错", {
        error: err,
        耗时ms: Date.now() - tSum0,
      });
      ctx.status = 502;
      ctx.body = { error: "upstream_failed", stage: "summarize", message: (err as Error).message };
      return;
    }

    const summaryMessage = { role: "assistant" as const, content: `【历史对话摘要】\n${summary}` };
    const messagesSummarize: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      summaryMessage,
      ...recentOriginal,
      { role: "user", content: RECALL_QUESTION },
    ];

    // ── ⑤ 三次真调模型 ──
    const results: Record<string, string> = {};
    for (const stage of ["full", "sliding", "summarize"] as const) {
      const messages = stage === "full" ? messagesFull : stage === "sliding" ? messagesSliding : messagesSummarize;
      try {
        results[stage] = await callLlmOnce(messages, modelA, stage);
      } catch (err: unknown) {
        ctx.status = 502;
        ctx.body = { error: "upstream_failed", stage, message: (err as Error).message };
        return;
      }
    }

    const fullReply = results.full ?? "";
    const slidingReply = results.sliding ?? "";
    const summarizeReply = results.summarize ?? "";

    const hasKey = (s: string) => s.includes("Tina") || s.includes("上海") || s.includes("日料");
    const fullHas = hasKey(fullReply);
    const slidingHas = hasKey(slidingReply);
    const summarizeHas = hasKey(summarizeReply);

    logger.info("three-way.handler", "调用函数结束：three-way", "为什么打：要把三方判定打到日志；学习者事后翻日志一眼能验证「丢字面 vs 留语义」。当前：3 次问答 LLM 都已返回。", {
      返回值: {
        fullLen: messagesFull.length,
        slidingLen: messagesSliding.length,
        summarizeLen: messagesSummarize.length,
        fullHasKeyFact: fullHas,
        slidingHasKeyFact: slidingHas,
        summarizeHasKeyFact: summarizeHas,
      },
      字段释义: {
        "fullLen / slidingLen / summarizeLen": "三份 messages 长度",
        "fullHasKeyFact": "完整回答是否含 key fact",
        "slidingHasKeyFact": "滑动窗口后回答是否含 key fact（教学点：应 = false 因字面丢）",
        "summarizeHasKeyFact": "摘要压缩后回答是否含 key fact（教学点：应 = true 因 summary 里有）",
      },
      耗时ms: Date.now() - tSum0,
    });

    ctx.body = {
      config: { turnCount, slidingWindowSize, summarizeFrom, keepRecent, keyFactAtTurn, modelA },
      keyFact: KEY_FACT,
      question: RECALL_QUESTION,
      summary,
      full: { messages: messagesFull, reply: fullReply, hasKeyFact: fullHas },
      sliding: { messages: messagesSliding, reply: slidingReply, hasKeyFact: slidingHas },
      summarize: { messages: messagesSummarize, reply: summarizeReply, hasKeyFact: summarizeHas },
    };
  });
}
