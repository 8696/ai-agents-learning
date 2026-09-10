/**
 * 职责：POST /api/three-way-with-fallback —— 三方对照 + 摘要失败兜底降级。
 *       把「摘要压缩的真实代价」延伸：代价不只是「1 次 LLM 调用 + 1~3s」，还有「可能失败」。
 *       兜底策略：摘要失败 → 自动降级到滑动窗口（用户不感知失败，仍 200）。
 *
 * 数据流：
 *   浏览器 fetch { turnCount, slidingWindowSize, summarizeFrom, keepRecent, keyFactAtTurn, simulateSummarizeFail? }
 *     → Zod 校验
 *       → buildMockHistory + slidingWindowTrim
 *         → callLlmOnce(messagesFull) → fullReply                                 ← ① 完整（基线）
 *         → callLlmOnce(messagesSliding) → slidingReply                          ← ② 滑动窗口
 *         → [摘要] if simulateSummarizeFail: throw；else try summarizeOld
 *           ├─ 成功 → messagesSummarize + callLlmOnce → summarizeReply          ← ③ 摘要压缩
 *           └─ 失败（catch err）→ fallback 标记 used:true, reason:err.message
 *                                 messagesForAnswer = messagesSliding（复用 sliding 的裁剪结果）
 *                                 callLlmOnce(messagesSliding) → fallbackReply   ← ③ 兜底版
 *       → 出参 { full, sliding, summarize_or_fallback, fallback: { used, reason?, fallbackReply } }
 *     → React 5 张卡：① 完整 ② 滑动窗口 ③ 摘要压缩（或兜底版） ④ 兜底标记 ⑤ 三方对比小结
 *
 * 教学锚点（模块 06 · 02 · step-4 失败兜底降级）：
 *   - 「摘要压缩的真实代价」= 1 次 LLM 调用 + 1~3s + **可能失败**（限流 / 超时 / 5xx）
 *   - 「用户不感知失败」= 服务端吞掉摘要失败，自动降级到滑动窗口 → 200 响应 + fallback.used=true
 *   - 「日志 warn 记录」= 服务端日志打「摘要失败，降级为滑动窗口」→ 事后回查可发现
 *   - 对照 step-3：step-3 摘要失败会让整个请求 502；step-4 摘要失败降级到滑动窗口（200）
 *   - 覆盖需求清单需求 5「摘要失败兜底」
 *
 * 实现要点（2026-09-09）：
 *   - 模拟摘要失败通过请求参数 simulateSummarizeFail=true 注入（生产里实际是超时 / 5xx）
 *   - 兜底 fallback 复用 sliding 的裁剪结果（messagesSliding），不重复计算
 *   - 不抽到 lib/，重复比抽象便宜（step-1/2/3/4 各自完整）
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
    simulateSummarizeFail: z.boolean().default(false),
  })
  .refine(v => v.summarizeFrom + v.keepRecent <= v.turnCount, {
    message: "summarizeFrom + keepRecent 不能超过 turnCount",
    path: ["summarizeFrom"],
  });

// ── 与 step-3 同款（不重复抽到 lib/）──
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
  stage: string,
): Promise<string> {
  const request = { model, messages };
  const tokensEstimate = encode(messages.map(m => `${m.role}: ${m.content}`).join("\n")).length;
  logger.info(
    "││ 调用模型-三方对照（含兜底）",
    `调用模型开始：${stage}`,
    `为什么写这条日志：三方对照的关键证据——唯一变量是 messages 裁剪策略 + 兜底降级。当前：${stage}。`,
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
      "││ 调用模型-三方对照（含兜底）",
      `调用模型结束：${stage}`,
      `为什么写这条日志：要把完整 completion 写到日志，对照是否含 key fact。当前：${stage} 已返回。`,
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
      "││ 调用模型-三方对照（含兜底）",
      `调用模型结束：${stage}（失败）`,
      `模型调用本身抛错（限流 / 网络 / 超时）；原始错误对象原样进日志。当前：${stage} 失败。`,
      { error: err, stage, 入参: request, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
}

export function mountThreeWayWithFallbackRoutes(router: Router): void {
  router.post("/api/three-way-with-fallback", async (ctx: Context) => {
    // ── ① 入参校验 ──
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: "bad_request", issues: parsed.error.issues };
      logger.warn("three-way.bad_request", "调用函数结束：three-way-with-fallback（失败）", "入参 Zod 没通过；返回 400 给前端", {
        issues: parsed.error.issues,
      });
      return;
    }
    const { turnCount, slidingWindowSize, summarizeFrom, keepRecent, keyFactAtTurn, simulateSummarizeFail } = parsed.data;

    // ── ② 取 LLM 客户端 ──
    let modelA: string;
    try {
      modelA = getLlm().modelA;
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "no_llm", message: (err as Error).message };
      logger.error("three-way.no_llm", "调用函数结束：three-way-with-fallback（失败）", "getLlm 抛错；apps/.env 没配当前提供商的 Key", {
        error: err,
      });
      return;
    }

    // ── ③ 拼装 messages ──
    const mockHistory = buildMockHistory(turnCount, keyFactAtTurn);
    const messagesFull: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...mockHistory,
      { role: "user", content: RECALL_QUESTION },
    ];
    const messagesSliding = slidingWindowTrim(messagesFull, slidingWindowSize);
    const oldForSummary = mockHistory.slice(0, summarizeFrom);
    const recentOriginal = mockHistory.slice(summarizeFrom);

    logger.info("three-way.handler", "调用函数开始：three-way-with-fallback", "为什么写这条日志：失败兜底降级是本条核心交付物（需求 5「摘要失败兜底降级」）。不写完整数据流就讲不清「摘要失败时服务仍 200」的体验差异。当前：拼装完成 + 即将跑（完整 + 滑动 + 摘要 ± 兜底）。", {
      入参: { turnCount, slidingWindowSize, summarizeFrom, keepRecent, keyFactAtTurn, simulateSummarizeFail, modelA },
      字段释义: {
        "simulateSummarizeFail": "true = 模拟摘要 LLM 失败（教学注入）；false = 正常跑",
        "其他": "见 step-3 README",
      },
      __code: "三份 messages 拼装见上方；下一步：fullReply + slidingReply + summarize（try/catch → fallback）。",
    });

    // ── ④ 调真模型 #1（完整）+ #2（滑动窗口）──
    let fullReply = "";
    let slidingReply = "";
    try {
      fullReply = await callLlmOnce(messagesFull, modelA, "完整");
      slidingReply = await callLlmOnce(messagesSliding, modelA, "滑动窗口");
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "upstream_failed", stage: "full-or-sliding", message: (err as Error).message };
      return;
    }

    // ── ⑤ 摘要（带兜底降级）──
    let summary: string | null = null;
    let summarizeReply = "";
    let fallbackUsed = false;
    let fallbackReason: string | null = null;

    if (simulateSummarizeFail) {
      // 模拟失败：直接 throw，触发兜底
      logger.warn("││ 调用函数-摘要兜底", "调用函数开始：摘要模拟失败", "为什么写这条日志：教学演示注入摘要失败；让学习者看见「摘要失败 → 自动降级到滑动窗口」的完整流程。当前：模拟超时即将 throw。", {
        入参: { simulateSummarizeFail: true, summarizeFrom },
        __code: "throw new Error('摘要 LLM 模拟超时（教学演示）');",
      });
      const err = new Error("摘要 LLM 模拟超时（教学演示）");
      logger.warn("││ 调用函数-摘要兜底", "调用函数结束：摘要兜底降级", "为什么写这条日志：摘要失败 → 自动降级到滑动窗口；不写 warn 事后排查不到「为什么这次用的是滑动窗口而不是摘要」。当前：catch 已捕获，fallback 标记 used=true。", {
        fallbackUsed: true,
        fallbackReason: err.message,
        fallbackMessagesLen: messagesSliding.length,
        __code: "fallbackUsed = true; messagesForAnswer = messagesSliding;",
      });
      fallbackUsed = true;
      fallbackReason = err.message;
      // 兜底：用 sliding 的 messages 答
      try {
        summarizeReply = await callLlmOnce(messagesSliding, modelA, "兜底（滑动窗口）");
      } catch (err2: unknown) {
        ctx.status = 502;
        ctx.body = { error: "upstream_failed", stage: "fallback", message: (err2 as Error).message };
        return;
      }
    } else {
      // 正常摘要
      try {
        summary = await summarizeOld(oldForSummary, modelA);
        const summaryMessage = { role: "assistant" as const, content: `【历史对话摘要】\n${summary}` };
        const messagesSummarize: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
          { role: "system", content: SYSTEM_PROMPT },
          summaryMessage,
          ...recentOriginal,
          { role: "user", content: RECALL_QUESTION },
        ];
        summarizeReply = await callLlmOnce(messagesSummarize, modelA, "摘要压缩");
      } catch (err: unknown) {
        // 真实失败（不模拟）→ 同样兜底
        logger.warn("││ 调用函数-摘要兜底", "调用函数结束：摘要兜底降级", "为什么写这条日志：摘要失败 → 自动降级到滑动窗口；不写 warn 事后排查不到「为什么这次用的是滑动窗口」。当前：catch 已捕获，fallback 标记 used=true。", {
          fallbackUsed: true,
          fallbackReason: (err as Error).message,
          fallbackMessagesLen: messagesSliding.length,
          error: err,
        });
        fallbackUsed = true;
        fallbackReason = (err as Error).message;
        try {
          summarizeReply = await callLlmOnce(messagesSliding, modelA, "兜底（滑动窗口）");
        } catch (err2: unknown) {
          ctx.status = 502;
          ctx.body = { error: "upstream_failed", stage: "fallback", message: (err2 as Error).message };
          return;
        }
      }
    }

    // ── ⑥ 判定 + 出参 ──
    const hasKey = (s: string) => s.includes("Tina") || s.includes("上海") || s.includes("日料");
    const fullHas = hasKey(fullReply);
    const slidingHas = hasKey(slidingReply);
    const summarizeHas = hasKey(summarizeReply);

    logger.info("three-way.handler", "调用函数结束：three-way-with-fallback", "为什么写这条日志：要把兜底标记 + 三方判定写到日志；学习者事后翻日志一眼能看到「这次走了 fallback 路径」。", {
      返回值: {
        fullHasKeyFact: fullHas,
        slidingHasKeyFact: slidingHas,
        summarizeHasKeyFact: summarizeHas,
        fallbackUsed,
        fallbackReason,
        simulateSummarizeFail,
      },
      字段释义: {
        "fallbackUsed": "true = 摘要失败，本次的「摘要压缩位」用了滑动窗口 messages 答的（用户不感知）",
        "fallbackReason": "摘要失败的原因（err.message）",
        "simulateSummarizeFail": "true = 教学注入；false = 真实失败（生产里通常 = 限流 / 超时）",
      },
    });

    ctx.body = {
      config: { turnCount, slidingWindowSize, summarizeFrom, keepRecent, keyFactAtTurn, simulateSummarizeFail, modelA },
      keyFact: KEY_FACT,
      question: RECALL_QUESTION,
      summary,
      full: { messages: messagesFull, reply: fullReply, hasKeyFact: fullHas },
      sliding: { messages: messagesSliding, reply: slidingReply, hasKeyFact: slidingHas },
      summarize_or_fallback: { reply: summarizeReply, hasKeyFact: summarizeHas, fallbackUsed },
      fallback: {
        used: fallbackUsed,
        reason: fallbackReason,
        fallbackMessages: messagesSliding,
      },
    };
  });
}
