/**
 * 职责：POST /api/token-budget —— 按 token 算窗口（变体 2）。
 *       滑动窗口 K 从「条数」换成「token 数」（用 gpt-tokenizer 估算）。
 *       关键差别：单条超长消息按条数算只算 1 条，按 token 算会占大半预算。
 *
 * 数据流：
 *   浏览器 fetch { turnCount, slidingTokenBudget, summarizeTokenBudget, keepRecent, keyFactAtTurn }
 *     → Zod 闸门
 *       → buildMockHistory + encode 每条 token 数
 *       → messagesFull      = [system, ...mockHistory, 问句]
 *       → messagesSliding   = tokenWindowTrim(messagesFull, slidingTokenBudget)   ← 从最新往旧累加 ≤ budget
 *       → oldForSummary     = mockHistory.slice(0, summarizeBoundary)             ← 找 token > summarizeTokenBudget 的远期
 *       → summary           = summarizeOld(oldForSummary)                          ← 调 LLM 摘要
 *       → messagesSummarize = [system, summary_message, ...recentOriginal, 问句]
 *       → callLlmOnce(messagesFull)      → fullReply
 *       → callLlmOnce(messagesSliding)   → slidingReply
 *       → callLlmOnce(messagesSummarize) → summarizeReply
 *     → 出参 { full, sliding, summarize, tokenReport }
 *     → React 5 张卡：① 完整 ② 滑动窗口（按 token） ③ 摘要压缩 ④ summary 内容 ⑤ 「按 token vs 按条数」对照
 *
 * 教学锚点（模块 06 · 02 · step-5 按 token 算窗口 · 变体 2）：
 *   - 「按 token」vs「按条数」= 单条超长消息时的关键差异
 *   - 「按 token 算窗口」= 从最新往旧累加，累加到 ≤ budget 为止；system pin
 *   - 「按 token 触发摘要」= 远期 token 累计 > 阈值才摘要
 *   - 「token 预算」= 生产里最稳的硬上限控制方式（不依赖消息长度）
 *
 * 实现要点（2026-09-09）：
 *   - 复用 step-3 的 buildMockHistory / summarizeOld / callLlmOnce（不重复抽到 lib/）
 *   - 替换 slidingWindowTrim → tokenWindowTrim（变体 2 的核心变化）
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
    slidingTokenBudget: z.number().int().min(50).max(50000).default(500),
    summarizeTokenBudget: z.number().int().min(50).max(50000).default(200),
    keepRecent: z.number().int().min(0).default(5),
    keyFactAtTurn: z.number().int().min(1).default(1),
  })
  .refine(v => v.keepRecent <= v.turnCount, {
    message: "keepRecent 不能超过 turnCount",
    path: ["keepRecent"],
  });

// ── 与 step-1~4 同款（不重复抽到 lib/）──
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

// ── 按 token 算窗口（变体 2 的核心）──
// 规则：system 永远 pin；从最新消息往旧累加 token，累加到 ≤ budget 为止；保持顺序。
// 与按条数的差别：单条超长消息按条数算只占 1 条，按 token 算会占大半预算。
function tokenWindowTrim(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  tokenBudget: number,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const systemMsgs = messages.filter(m => m.role === "system");
  const rest = messages.filter(m => m.role !== "system");
  const tail: typeof rest = [];
  let used = 0;
  // 从最新往旧累加；累加到 > budget 就停（保留 system 不计入 budget）
  for (let i = rest.length - 1; i >= 0; i--) {
    const msg = rest[i];
    const tokens = encode(msg.content).length;
    if (used + tokens > tokenBudget && tail.length > 0) {
      // 已经保留至少 1 条，且再加就超预算 → 停
      break;
    }
    tail.unshift(msg);
    used += tokens;
  }
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
  const stageZh = stage === "full" ? "完整" : stage === "sliding" ? "滑动窗口（按 token）" : "摘要压缩（按 token）";
  logger.info(
    "││ 调用模型-按 token 对照",
    `调用模型开始：${stageZh}`,
    `为什么打：变体 2 的关键证据——窗口控制从「条数」换成「token」。当前：${stageZh}（messages 长度 ${messages.length}）。`,
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
      "││ 调用模型-按 token 对照",
      `调用模型结束：${stageZh}`,
      `为什么打：要把完整 completion 打到日志，对照是否含 key fact。`,
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
      "││ 调用模型-按 token 对照",
      `调用模型结束：${stageZh}（失败）`,
      `模型调用抛错`,
      { error: err, stage, 入参: request, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
}

export function mountTokenBudgetRoutes(router: Router): void {
  router.post("/api/token-budget", async (ctx: Context) => {
    // ── ① 入参闸门 ──
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: "bad_request", issues: parsed.error.issues };
      logger.warn("token-budget.bad_request", "调用函数结束：token-budget（失败）", "入参 Zod 没通过；返回 400 给前端", {
        issues: parsed.error.issues,
      });
      return;
    }
    const { turnCount, slidingTokenBudget, summarizeTokenBudget, keepRecent, keyFactAtTurn } = parsed.data;

    // ── ② 取 LLM 客户端 ──
    let modelA: string;
    try {
      modelA = getLlm().modelA;
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "no_llm", message: (err as Error).message };
      logger.error("token-budget.no_llm", "调用函数结束：token-budget（失败）", "getLlm 抛错", {
        error: err,
      });
      return;
    }

    // ── ③ 拼装 + token 估算 ──
    const mockHistory = buildMockHistory(turnCount, keyFactAtTurn);
    const messagesFull: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...mockHistory,
      { role: "user", content: RECALL_QUESTION },
    ];
    const messagesSliding = tokenWindowTrim(messagesFull, slidingTokenBudget);

    // 摘要边界：滑动窗口保留 + 问句 之外 = 远期
    // 按 token 触发：远期 token > summarizeTokenBudget 才做摘要；否则全部留原文
    const slidingBoundary = messagesSliding.length - 1 - 1; // 减 system + 减问句
    const oldForSummary = mockHistory.slice(0, Math.max(0, slidingBoundary));
    const oldSummaryTokens = oldForSummary.reduce((s, m) => s + encode(m.content).length, 0);
    const recentOriginal = mockHistory.slice(slidingBoundary);

    logger.info("token-budget.handler", "调用函数开始：token-budget", "为什么打：变体 2「按 token 算窗口」的对照实验。打完数据流才讲得清「按 token vs 按条数」的差别。", {
      入参: { turnCount, slidingTokenBudget, summarizeTokenBudget, keepRecent, keyFactAtTurn, modelA },
      字段释义: {
        "slidingTokenBudget": "滑动窗口保留的 token 上限（gpt-tokenizer 估算）",
        "summarizeTokenBudget": "摘要触发阈值（远期 token > 此值才摘要；否则 messagesSummarize = messagesSliding 直接复用滑动窗口的 messages，相当于「全部留原文」零额外调用）",
        "keepRecent": "近期 K 条留原文（与 step-3 同款）",
        "其他": "同 step-3",
      },
      tokenReport: {
        fullMessagesLen: messagesFull.length,
        slidingMessagesLen: messagesSliding.length,
        slidingTokensUsed: messagesSliding.reduce((s, m) => s + encode(m.content).length, 0),
        oldSummaryTokens,
      },
      __code: "tokenWindowTrim + summarizeOld + 三次 callLlmOnce；详见 routes/token-budget.ts",
    });

    // ── ④ 摘要触发闸门（缺口 3 修复 · 2026-09-09）──
    // 规则：远期 token > summarizeTokenBudget 才调摘要 LLM；否则 messagesSummarize 直接复用 messagesSliding（零额外调用，「全部留原文」语义）
    // 这是易混 7「触发阈值 vs 滑动窗口 budget = 两条独立的线」的代码体现
    const triggerSummarize = oldSummaryTokens > summarizeTokenBudget;
    let summary: string | null = null;
    let messagesSummarize: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    if (triggerSummarize) {
      try {
        summary = await summarizeOld(oldForSummary, modelA);
      } catch (err: unknown) {
        ctx.status = 502;
        ctx.body = { error: "upstream_failed", stage: "summarize", message: (err as Error).message };
        return;
      }
      const summaryMessage = { role: "assistant" as const, content: `【历史对话摘要】\n${summary}` };
      messagesSummarize = [
        { role: "system", content: SYSTEM_PROMPT },
        summaryMessage,
        ...recentOriginal,
        { role: "user", content: RECALL_QUESTION },
      ];
    } else {
      logger.info("││ 调用函数-摘要触发闸门", "调用函数结束：摘要触发未命中", "为什么打：远期 token ≤ summarizeTokenBudget → 不调摘要 LLM（节省 1 次出网）；messagesSummarize 直接复用 messagesSliding = 「全部留原文」语义。", {
        oldSummaryTokens,
        summarizeTokenBudget,
        fallbackTo: "messagesSliding（与 ② 滑动窗口同源）",
      });
      messagesSummarize = messagesSliding;
    }

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

    // ── ⑥ 出参 ──
    logger.info("token-budget.handler", "调用函数结束：token-budget", "为什么打：把「按 token vs 按条数」对照的关键数据打到日志。", {
      返回值: {
        fullLen: messagesFull.length,
        slidingLen: messagesSliding.length,
        slidingTokensUsed: messagesSliding.reduce((s, m) => s + encode(m.content).length, 0),
        summarizeLen: messagesSummarize.length,
        fullHasKey: hasKey(fullReply),
        slidingHasKey: hasKey(slidingReply),
        summarizeHasKey: hasKey(summarizeReply),
      },
    });

    ctx.body = {
      config: { turnCount, slidingTokenBudget, summarizeTokenBudget, keepRecent, keyFactAtTurn, modelA },
      keyFact: KEY_FACT,
      question: RECALL_QUESTION,
      summary,
      full: {
        messages: messagesFull,
        reply: fullReply,
        hasKeyFact: hasKey(fullReply),
        totalTokens: messagesFull.reduce((s, m) => s + encode(m.content).length, 0),
      },
      sliding: {
        messages: messagesSliding,
        reply: slidingReply,
        hasKeyFact: hasKey(slidingReply),
        totalTokens: messagesSliding.reduce((s, m) => s + encode(m.content).length, 0),
      },
      summarize: {
        messages: messagesSummarize,
        reply: summarizeReply,
        hasKeyFact: hasKey(summarizeReply),
        totalTokens: messagesSummarize.reduce((s, m) => s + encode(m.content).length, 0),
      },
      tokenReport: {
        fullMessagesLen: messagesFull.length,
        slidingMessagesLen: messagesSliding.length,
        slidingTokensUsed: messagesSliding.reduce((s, m) => s + encode(m.content).length, 0),
        slidingBudget: slidingTokenBudget,
      },
    };
  });
}
