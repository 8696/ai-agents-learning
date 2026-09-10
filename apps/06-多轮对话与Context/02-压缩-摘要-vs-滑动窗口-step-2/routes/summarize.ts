/**
 * 职责：POST /api/summarize —— 摘要压缩对照实验。
 *       把「摘要压缩保留了什么」变成可观察结果：跑 50 轮假历史 + 调 LLM 做摘要 + 摘要后再问同一问题。
 *
 * 数据流：
 *   浏览器 fetch { turnCount, summarizeFrom, keepRecent, keyFactAtTurn }
 *     → Zod 校验
 *       → buildMockHistory() 生成 N 轮假对话（同 step-1 buildMockHistory）
 *       → messagesBefore = [system, ...mockHistory, 问句]
 *         → callLlmOnce(messagesBefore) → beforeReply                                  ← 调真模型 #1（基线）
 *         → summarizeOld(messagesBefore.slice(1, -1).slice(0, summarizeFrom)) → summary  ← 调真模型 #2（摘要）
 *         → messagesAfter = [system, {role:'assistant', content:summary}, ...近 K 条原文, 问句]
 *         → callLlmOnce(messagesAfter) → summarizeReply                                ← 调真模型 #3（验证）
 *       → 出参 { messagesBefore, summary, summaryMessages, messagesAfter, beforeReply, summarizeReply, ... }
 *     → React 四张卡片：① 裁剪前 ② summary 内容 ③ 摘要后 ④ 对比小结
 *
 * 教学锚点（模块 06 · 02 · 摘要压缩 step-2）：
 *   - 「摘要压缩」= 调 LLM 把旧 N 条浓缩成 1 条字符串；不是丢，是重写
 *   - 「保留语义、丢细节」= summary 里会出现「用户 Tina 住上海 喜日料」，但「sushi 店招牌 omakase」会变成「聊过日料店」
 *   - 「代价」= 1 次额外 LLM 调用 ≈ 500ms~3s（不是 0 成本）
 *   - 「远期摘要 + 近期原文」是生产最常见的混合形态（step-1 滑动窗口 K=6 等价于「全丢」= 极端的 0 原文策略）
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
    summarizeFrom: z.number().int().min(1).default(45),
    keepRecent: z.number().int().min(0).default(5),
    keyFactAtTurn: z.number().int().min(1).default(1),
  })
  // 摘要 + 近期原文不能超过总轮数
  .refine(v => v.summarizeFrom + v.keepRecent <= v.turnCount, {
    message: "summarizeFrom + keepRecent 不能超过 turnCount",
    path: ["summarizeFrom"],
  });

// ── 与 step-1 同款（不重复抽到 lib/，因为本条只 2 个 step 复用，重复比抽象便宜）──
const SYSTEM_PROMPT =
  "你是一个有帮助的助手。用户会在历史对话里告诉你关于他/她自己的事实（姓名、所在地、偏好等）。" +
  "当用户问「你还记得我叫什么、住哪、最喜欢什么」时，请尽量根据历史对话回答；" +
  "回答要简洁，分点列出你记得的事实即可。";

const KEY_FACT =
  "你好，我先自我介绍一下：我叫 Tina，住在上海，最喜欢的菜是日料，尤其是寿司和拉面。";

const RECALL_QUESTION = "现在问题来了——你还记得我叫什么、住哪、最喜欢吃什么吗？请分点回答。";

// 摘要 prompt：明确「任务 = 总结历史对话」，强调保留关键事实，禁止对话延续
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

async function callLlmOnce(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  model: string,
  stage: "before" | "after",
): Promise<string> {
  const request = { model, messages };
  const tokensEstimate = encode(messages.map(m => `${m.role}: ${m.content}`).join("\n")).length;
  const label = stage === "before" ? "对比补全-before" : "对比补全-after";
  logger.info(
    "││ 调用模型-对比补全",
    `调用模型开始：${label}`,
    stage === "before"
      ? "为什么写这条日志：基线对照——没摘要前模型答什么；不写完整 messages 就讲不清对照。当前：messagesBefore 已拼好，即将发请求。"
      : "为什么写这条日志：验证摘要后模型还记不记得 key fact；不写完整 messages 就讲不清「摘要到底保留了什么」。当前：messagesAfter 已拼好（含 summary + 近期原文）。",
    {
      入参: request,
      stage,
      tokensEstimate,
      字段释义: {
        "入参.messages": "实际发给模型的完整 messages",
        "入参.model": "本轮用的模型名",
        "tokensEstimate": "粗估 token 数（并存，不代替 messages）",
      },
      __code: "const completion = await getLlm().openai.chat.completions.create(request);",
    },
  );
  const t0 = Date.now();
  try {
    const completion = await getLlm().openai.chat.completions.create(request);
    const reply = completion.choices[0]?.message?.content ?? "";
    logger.info(
      "││ 调用模型-对比补全",
      `调用模型结束：${label}`,
      stage === "before"
        ? "为什么写这条日志：要把完整 completion 写到日志，对照 after。当前：基线模型已返回。"
        : "为什么写这条日志：要把完整 completion 写到日志，对照 before 是不是「丢字面、留语义」。当前：摘要后模型已返回。",
      {
        返回值: completion,
        stage,
        replyTokens: encode(reply).length,
        字段释义: {
          "choices[0].message.content": "assistant 回答原文（对照 Tina / 上海 / 日料）",
          "replyTokens": "粗估回答 token 数（并存）",
        },
        耗时ms: Date.now() - t0,
      },
    );
    return reply;
  } catch (err: unknown) {
    logger.error(
      "││ 调用模型-对比补全",
      `调用模型结束：${label}（失败）`,
      "LLM 调用抛错；原始错误对象 + 完整入参原样进日志",
      { error: err, stage, 入参: request, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
}

// ── 调一次摘要 LLM ──
// 输入：远期 N 条 user/assistant；输出：1 段总结文本
//
// 实现要点（2026-09-09 踩坑修复）：
//   不能把 oldMessages 直接以 user/assistant 多轮交替的形式拼进 messages ——
//   模型会把它当成「对话上下文」接着说话（如复读最后一条 assistant），忽略 system 摘要指令。
//   改成：把 N 条 history 拼成一段带 [user]/[assistant] 标签的纯文本，作为 1 条 user message 发出去。
//   这样 LLM 看到的是「一段待总结文本」，不是「一段对话」。
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
  const request = {
    model,
    messages: [
      { role: "system" as const, content: SUMMARIZE_INSTRUCTION },
      { role: "user" as const, content: userPrompt },
    ],
  };
  logger.info(
    "││ 调用模型-对话摘要",
    "调用模型开始：对话摘要",
    "为什么写这条日志：这是真正发网络请求的摘要调用；不写完整 request 就讲不清「摘要压缩的代价 / 模型到底看见了什么」。当前：远期 N 条已切出并转录成纯文本。",
    {
      入参: request,
      oldMessages,
      字段释义: {
        "入参.messages": "实际发给摘要模型的完整 messages（system 指令 + 转录后的 user 全文）",
        "oldMessages": "被摘要的原始远期 user/assistant 数组（转录前原文）",
      },
      __code: "const completion = await getLlm().openai.chat.completions.create(request);",
    },
  );
  const t0 = Date.now();
  try {
    const completion = await getLlm().openai.chat.completions.create(request);
    const summary = completion.choices[0]?.message?.content ?? "";
    logger.info(
      "││ 调用模型-对话摘要",
      "调用模型结束：对话摘要",
      "为什么写这条日志：要把完整 completion + summary 原文写到日志；学习者能直接看到「summary 写进去什么」。当前：摘要已返回。",
      {
        返回值: completion,
        summaryTokens: encode(summary).length,
        字段释义: {
          "choices[0].message.content": "LLM 写的 1 段总结（将替代原远期 N 条）",
          "summaryTokens": "粗估 token 数（并存）",
        },
        耗时ms: Date.now() - t0,
      },
    );
    return summary;
  } catch (err: unknown) {
    logger.error(
      "││ 调用模型-对话摘要",
      "调用模型结束：对话摘要（失败）",
      "摘要 LLM 调用抛错；这是 step-2 的主要失败通道（step-4 才加兜底降级）",
      { error: err, 入参: request, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
}

export function mountSummarizeRoutes(router: Router): void {
  router.post("/api/summarize", async (ctx: Context) => {
    // ── ① 入参校验 ──
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: "bad_request", issues: parsed.error.issues };
      logger.warn("summarize.bad_request", "调用函数结束：summarize（失败）", "入参 Zod 没通过；返回 400 给前端", {
        issues: parsed.error.issues,
      });
      return;
    }
    const { turnCount, summarizeFrom, keepRecent, keyFactAtTurn } = parsed.data;

    // ── ② 取 LLM 客户端 ──
    let modelA: string;
    try {
      modelA = getLlm().modelA;
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "no_llm", message: (err as Error).message };
      logger.error("summarize.no_llm", "调用函数结束：summarize（失败）", "getLlm 抛错；apps/.env 没配当前提供商的 Key", {
        error: err,
      });
      return;
    }

    // ── ③ 拼 messagesBefore ──
    const mockHistory = buildMockHistory(turnCount, keyFactAtTurn);
    const messagesBefore: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...mockHistory,
      { role: "user", content: RECALL_QUESTION },
    ];

    const tHandler0 = Date.now();
    logger.info("summarize.handler", "调用函数开始：summarize", "为什么写这条日志：路由是摘要压缩对照实验的唯一入口；不写完整数据流下面就讲不清「摘要压缩到底保留了什么」。当前：假历史已拼好，即将调 3 次模型。", {
      入参: { turnCount, summarizeFrom, keepRecent, keyFactAtTurn, modelA, messagesBefore },
      字段释义: {
        "turnCount": "生成的假对话轮数（不含 system；含 key fact 那一轮）",
        "summarizeFrom": "取前 N 条 user/assistant 喂给 LLM 做摘要（远期）",
        "keepRecent": "最后 K 条 user/assistant 留原文（近期）",
        "summarizeFrom + keepRecent": "必须 ≤ turnCount（校验已拦）",
        "keyFactAtTurn": "key fact「自我介绍」放在第几轮",
        "modelA": "来自 apps/.env 顶层 LLM_MODEL 或该家默认",
        "messagesBefore": "摘要前完整 messages（system + 假历史 + 问句）",
      },
      本轮为什么是这些参数: {
        "turnCount = 50": "演示长对话；50 轮确保覆盖 summarizeFrom=45 + keepRecent=5",
        "summarizeFrom = 45": "50 轮的 90% 做摘要；剩 5 条原文",
        "keepRecent = 5": "5 条原文够模型记住「刚刚聊过什么」",
        "keyFactAtTurn = 1": "key fact 在第 1 轮 → 必进摘要远期 → 必入 summary",
      },
      __code: "const messagesBefore = [system, ...mockHistory, 问句];",
    });

    // ── ④ 调真模型 #1（基线：完整 messages；五条日志在 callLlmOnce 内）──
    let beforeReply = "";
    try {
      beforeReply = await callLlmOnce(messagesBefore, modelA, "before");
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "upstream_failed", stage: "before", message: (err as Error).message };
      return;
    }

    // ── ⑤ 切分：远期 summarizeFrom 条 → 摘要（五条日志在 summarizeOld 内）──
    const oldForSummary = mockHistory.slice(0, summarizeFrom);
    const recentOriginal = mockHistory.slice(summarizeFrom);

    let summary = "";
    try {
      summary = await summarizeOld(oldForSummary, modelA);
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "upstream_failed", stage: "summarize", message: (err as Error).message };
      return;
    }

    // ── ⑥ 拼 messagesAfter = [system, summary_message, ...近期原文, 问句] ──
    const summaryMessage = { role: "assistant" as const, content: `【历史对话摘要】\n${summary}` };
    const messagesAfter: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      summaryMessage,
      ...recentOriginal,
      { role: "user", content: RECALL_QUESTION },
    ];

    // ── ⑦ 调真模型 #3（验证：摘要后问答；五条日志在 callLlmOnce 内）──
    let summarizeReply = "";
    try {
      summarizeReply = await callLlmOnce(messagesAfter, modelA, "after");
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "upstream_failed", stage: "after", message: (err as Error).message };
      return;
    }

    // ── ⑧ 判定 + 出参 ──
    const beforeHasKeyFact = beforeReply.includes("Tina") || beforeReply.includes("上海") || beforeReply.includes("日料");
    const summaryHasKeyFact = summary.includes("Tina") || summary.includes("上海") || summary.includes("日料");
    const summarizeReplyHasKeyFact = summarizeReply.includes("Tina") || summarizeReply.includes("上海") || summarizeReply.includes("日料");

    const body = {
      config: { turnCount, summarizeFrom, keepRecent, keyFactAtTurn, modelA },
      keyFact: KEY_FACT,
      question: RECALL_QUESTION,
      messagesBefore,
      summary,
      summaryMessage,
      summaryMessages: oldForSummary,
      recentOriginal,
      messagesAfter,
      beforeReply,
      summarizeReply,
      keyFactInBefore: beforeHasKeyFact,
      keyFactInSummary: summaryHasKeyFact,
      keyFactInSummarizeReply: summarizeReplyHasKeyFact,
      compressedCount: oldForSummary.length,
      summaryReplacesCount: oldForSummary.length,
    };

    logger.info("summarize.handler", "调用函数结束：summarize", "为什么写这条日志：要把本路由完整出参写到日志；学习者事后翻日志一眼能看到「摘要保留了什么」。当前：3 次 LLM 都已返回。", {
      返回值: body,
      字段释义: {
        "messagesBefore / messagesAfter": "摘要前后完整 messages",
        "summary / summaryMessage": "摘要原文 + 注入后的 assistant 消息",
        "beforeReply / summarizeReply": "两次问答原文",
        "keyFactInBefore / keyFactInSummary / keyFactInSummarizeReply": "是否命中 Tina / 上海 / 日料",
      },
      耗时ms: Date.now() - tHandler0,
    });

    ctx.body = body;
  });
}
