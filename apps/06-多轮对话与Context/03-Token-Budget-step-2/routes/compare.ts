/**
 * 职责：POST /api/compare —— 同一份假历史，双策略（trim vs summarize）真调模型对照。
 *       把「丢字面 vs 留语义」变成可观察结果（不是抽象描述）。
 *
 * 数据流：
 *   浏览器 fetch { historyCount, outputBudget, totalBudget, summarizeFrom, keepRecent }
 *     → Zod 闸门
 *       → buildMockHistory(historyCount) 生成 N 轮假 user/assistant
 *         → 第 1 轮 user 放 KEY_FACT（自我介绍）
 *       → estimateBudget(...) → beforeBudget
 *       → trim 路径：
 *         trimToBudget(...) → messagesTrim = [system, ...trimmed, userText]
 *       → summarize 路径：
 *         summarizeOld(mockHistory.slice(0, summarizeFrom), modelA) → summary
 *         → messagesSummarize = [system, summaryMessage, ...recentOriginal, userText]
 *         → 若仍超 totalBudget → 继续丢最近原文直到 fit（demo 内简单处理：丢 keepRecent 后面的）
 *       → 调真模型 2 次：trim / summarize → 两个 reply
 *       → 用 KEY_FACT 子串检测（"Tina" / "上海" / "日料"） → trimHas / summarizeHas
 *     → 出参 { trim, summarize, beforeBudget }
 *     → React 双卡对照 + 判定小结
 *
 * 教学锚点（模块 06 · 03 · Token Budget step-2）：
 *   - 同 query、同模型、同一 history、同一 totalBudget，唯一变量是裁剪策略
 *   - 「trim = 丢字面」= key fact 在远期 → 被丢 → 模型忘（与 02-step-1 滑动窗口同效果）
 *   - 「summarize = 留语义」= key fact 在 summary 里 → 仍被模型记起（与 02-step-3 同效果）
 *   - 「代价」= summarize 多 1 次 LLM 调用（先调摘要、再调问答）
 *
 * **不演示**：硬阈值应急、选择性注入、软硬双层、失败兜底降级 —— 这些进 step-N。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { encode } from "gpt-tokenizer";
import { getLlm } from "../../../llm.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  historyCount: z.number().int().min(2).max(200).default(50),
  outputBudget: z.number().int().min(64).max(4000).default(800),
  totalBudget: z.number().int().min(512).max(32000).default(2000),
  summarizeFrom: z.number().int().min(1).max(199).default(40),
  keepRecent: z.number().int().min(0).max(50).default(8),
}).refine(v => v.summarizeFrom + v.keepRecent <= v.historyCount, {
  message: "summarizeFrom + keepRecent 不能超过 historyCount",
  path: ["summarizeFrom"],
});

// 系统提示：明确让模型在回答里复读 key fact（方便教学对比一眼看有没有丢）
const SYSTEM_PROMPT =
  "你是一个有帮助的助手。用户会在历史对话里告诉你关于他/她自己的事实（姓名、所在地、偏好等）。" +
  "当用户问「你还记得我叫什么、住哪、最喜欢吃什么」时，请尽量根据历史对话回答；" +
  "回答要简洁，分点列出你记得的事实即可。";

// key fact：教学锚点「自我介绍」里的可检测字串
const KEY_FACT =
  "你好，我先自我介绍一下：我叫 Tina，住在上海，最喜欢的菜是日料，尤其是寿司和拉面。";
// 关键事实判定：检测"肯定事实陈述" vs "否认/反例"
// 设计原则（2026-09-09）：模型在反例/否认里提到 "你住在上海" 这种字串不算 ✅
// （例：「不能据此推断你住在上海」命中"住在上海"但应判 ❌）
// 用"肯定标记 - 否定标记"的简单计数判定：
//   肯定标记（陈述事实）："你叫 Tina" / "你住在上海" / "你喜欢日料"
//   否定标记（否认 / 反例）："未提及" / "没有" / "不能据此推断" / "并不记得" / "抱歉" / "不记得" / "没记录到"
// 判定规则：肯定命中 ≥ 1 且 否定命中 = 0 → ✅；否则 ❌
const KEY_FACT_AFFIRMATIVE = [
  "你叫 Tina",
  "你叫Tina",
  "你的名字是 Tina",
  "你的名字是Tina",
  "你住在上海",
  "你住上海",
  "你的所在地是上海",
  "你的所在地是 上海",
  "你喜欢日料",
  "你喜欢的菜是日料",
  "最喜欢的菜是日料",
  "你喜欢寿司和拉面",
];
const KEY_FACT_NEGATIVE = [
  "未提及",
  "没有",
  "不能据此推断",
  "并不记得",
  "不记得",
  "没记录到",
  "抱歉",
  "无法确定",
  "没看到",
];
const RECALL_QUESTION = "现在问题来了——你还记得我叫什么、住哪、最喜欢吃什么吗？请分点回答。";

// 摘要 prompt（与 02-step-3 同款；用户在该文件旁即可对照）
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
  "- 任何对话延续（如「好的，关于 XXX 我先回应」）\n" +
  "- 任何解释 / 注释 / 编号 / 列表符号\n" +
  "\n" +
  "【示例】\n" +
  "输入是一段历史对话，输出应该像：\n" +
  "\"用户自我介绍叫 Tina，住上海，喜欢日料（尤其寿司和拉面）。之后聊过上海天气、推荐电影、拉面馆等话题。\"\n" +
  "\n" +
  "现在请总结以下对话历史：";

// ── mock history（与 02-step-3 同款：第 1 轮是 key fact；其余额外填充）──
function buildMockHistory(historyCount: number): Array<{ role: "user" | "assistant"; content: string }> {
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
  for (let i = 1; i <= historyCount; i++) {
    if (i === 1) {
      out.push({ role: "user", content: KEY_FACT });
      out.push({ role: "assistant", content: "你好 Tina！已记住你住在上海、喜欢日料。有什么我可以帮你的吗？" });
    } else {
      const topic = fillerTopics[(i - 2) % fillerTopics.length];
      out.push({ role: "user", content: `第 ${i} 轮 · ${topic}` });
      out.push({ role: "assistant", content: `好的，关于「${topic}」我先简单回应一下。` });
    }
  }
  return out;
}

// ── 算一段文本的 token 数 ──
function countTokens(text: string): number {
  return encode(text).length;
}

// ── 三块预算分账 ──
function estimateBudget(
  systemText: string,
  history: Array<{ role: string; content: string }>,
  outputBudget: number,
) {
  const systemTokens = countTokens(systemText);
  const historyTokens = history.reduce((s, m) => s + countTokens(`${m.role}: ${m.content}`), 0);
  const total = systemTokens + historyTokens + outputBudget;
  return { systemTokens, historyTokens, outputBudget, total };
}

// ── trim 策略：丢最旧非 system 消息直到 total ≤ totalBudget（按 user/assistant 对丢）──
function trimToBudget(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  systemText: string,
  outputBudget: number,
  totalBudget: number,
): { trimmed: Array<{ role: "user" | "assistant"; content: string }>; dropped: number } {
  const sysTokens = countTokens(systemText);
  let tail = history.slice();
  let dropped = 0;
  while (tail.length > 0) {
    const cur = tail.reduce((s, m) => s + countTokens(`${m.role}: ${m.content}`), 0);
    const total = sysTokens + cur + outputBudget;
    if (total <= totalBudget) break;
    tail = tail.slice(2);
    dropped += 2;
  }
  return { trimmed: tail, dropped };
}

// ── summarize 策略：调 LLM 把远期 N 条浓缩成 1 条 summary + 留近 K 条原文 ──
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

// ── 调一次 LLM（不流式）──
async function callLlmOnce(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  model: string,
  stage: "trim" | "summarize",
): Promise<{ reply: string; completion: unknown }> {
  const request = { model, messages };
  logger.info(
    "││ 调用模型-双策略对照",
    `调用模型开始：双策略对照-${stage}`,
    `为什么打：双策略对照的关键证据——同 query 同模型，唯一变量是裁剪策略。当前：${stage} 路径即将发请求。`,
    {
      入参: request,
      stage,
      __code: "const completion = await getLlm().openai.chat.completions.create(request);",
    },
  );
  const t0 = Date.now();
  try {
    const completion = await getLlm().openai.chat.completions.create(request);
    const reply = (completion as { choices: Array<{ message: { content: string | null } }> }).choices[0]?.message?.content ?? "";
    logger.info(
      "││ 调用模型-双策略对照",
      `调用模型结束：双策略对照-${stage}`,
      `为什么打：要把完整 completion 打到日志，对照 key fact 是否还在。当前：${stage} 已返回。`,
      {
        返回值: completion,
        stage,
        replyTokens: encode(reply).length,
        耗时ms: Date.now() - t0,
      },
    );
    return { reply, completion };
  } catch (err: unknown) {
    logger.error(
      "││ 调用模型-双策略对照",
      `调用模型结束：双策略对照-${stage}（失败）`,
      "模型调用本身抛错（限流 / 网络 / 超时）；原始错误对象原样进日志。",
      { error: err, stage, 入参: request, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
}

export function mountCompareRoutes(router: Router): void {
  router.post("/api/compare", async (ctx: Context) => {
    // ── ① 入参闸门 ──
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: "bad_request", issues: parsed.error.issues };
      logger.warn("compare.bad_request", "调用函数结束：compare（失败）", "入参 Zod 没通过；返回 400 给前端", {
        issues: parsed.error.issues,
      });
      return;
    }
    const { historyCount, outputBudget, totalBudget, summarizeFrom, keepRecent } = parsed.data;

    // ── ② 取 LLM 客户端 ──
    let modelA: string;
    try {
      modelA = getLlm().modelA;
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "no_llm", message: (err as Error).message };
      logger.error("compare.no_llm", "调用函数结束：compare（失败）", "getLlm 抛错；apps/.env 没配当前提供商的 Key", {
        error: err,
      });
      return;
    }

    // ── ③ 拼装 history + 算三块预算（裁前）──
    const history = buildMockHistory(historyCount);
    const tHandler0 = Date.now();
    logger.info("compare.handler", "调用函数开始：compare", "为什么打：路由是双策略对照实验的唯一入口；不打完整数据流就讲不清「同 query 同模型、唯一变量是裁剪策略」。当前：假历史已拼好，即将算预算 + 走两条路径。", {
      入参: { historyCount, outputBudget, totalBudget, summarizeFrom, keepRecent, modelA },
      字段释义: {
        "historyCount": "生成的假对话轮数（第 1 轮是 key fact）",
        "outputBudget": "给模型留的输出 token 上限",
        "totalBudget": "三块合计的硬上限",
        "summarizeFrom": "远期 N 条喂给 LLM 做摘要（默认 40）",
        "keepRecent": "近期 K 条留原文（默认 8）",
        "modelA": "来自 apps/.env 顶层 LLM_MODEL 或该家默认",
      },
      __code: "buildMockHistory → estimateBudget → 走 trim 与 summarize 双路径",
    });

    const beforeBudget = estimateBudget(SYSTEM_PROMPT, history, outputBudget);

    // ── ④ trim 路径：丢最旧 ──
    const { trimmed, dropped: trimDropped } = trimToBudget(history, SYSTEM_PROMPT, outputBudget, totalBudget);
    const messagesTrim: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...trimmed,
      { role: "user", content: RECALL_QUESTION },
    ];
    const trimBudget = estimateBudget(SYSTEM_PROMPT, trimmed, outputBudget);

    // ── ⑤ summarize 路径：远期 N 条 → summary + 近期 K 条原文 ──
    const oldForSummary = history.slice(0, summarizeFrom);
    const recentOriginal = history.slice(summarizeFrom);

    let summary = "";
    try {
      logger.info("││ 调用模型-对话摘要", "调用函数开始：summarizeOld", "为什么打：summarize 路径的代价 = 多 1 次 LLM 调用；不打就讲不清「为什么摘要压缩比丢最旧贵」。", {
        入参: { summarizeFrom, oldMsgsCount: oldForSummary.length, modelA },
        __code: "const summary = await summarizeOld(oldForSummary, modelA);",
      });
      const tSum0 = Date.now();
      summary = await summarizeOld(oldForSummary, modelA);
      logger.info("││ 调用模型-对话摘要", "调用函数结束：summarizeOld", "为什么打：要把 summary 原文打到日志；学习者能直接看到「summary 写进去什么」。", {
        返回值: { summary, summaryTokens: encode(summary).length },
        耗时ms: Date.now() - tSum0,
      });
    } catch (err: unknown) {
      logger.error("││ 调用模型-对话摘要", "调用函数结束：summarizeOld（失败）", "摘要 LLM 抛错", { error: err });
      ctx.status = 502;
      ctx.body = { error: "upstream_failed", stage: "summarize", message: (err as Error).message };
      return;
    }

    const summaryMessage = { role: "assistant" as const, content: `【历史对话摘要】\n${summary}` };
    let messagesSummarize: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      summaryMessage,
      ...recentOriginal,
      { role: "user", content: RECALL_QUESTION },
    ];

    // 若 summary+近期仍超预算 → 继续丢最近原文（直到 fit）
    let summarizeDroppedFromRecent = 0;
    while (true) {
      const cur = estimateBudget(SYSTEM_PROMPT, messagesSummarize.slice(1, -1), outputBudget);
      if (cur.total <= totalBudget) break;
      // 从 summaryMessage 之后开始丢（system + summary + user 不能丢；只丢非 system/summary 之间的最近原文）
      // 简化：从 messagesSummarize 里删掉倒数第 2 条（user 之前最近的原文）
      const idx = messagesSummarize.length - 2;
      if (idx <= 1) break;  // 只剩 system + summaryMessage，没原文可丢
      messagesSummarize.splice(idx, 1);
      summarizeDroppedFromRecent += 1;
      if (summarizeDroppedFromRecent > recentOriginal.length) break;  // 安全兜底
    }
    const summarizeBudget = estimateBudget(SYSTEM_PROMPT, messagesSummarize.slice(1, -1), outputBudget);

    // ── ⑥ 调真模型 2 次（trim + summarize）──
    // 关键事实判定：肯定标记 - 否定标记（2026-09-09 踩坑后修法）
    // 必须「肯定命中 ≥ 1 且 否定命中 = 0」才算 ✅；否则 ❌
    // 理由：模型在反例 / 否认里提到 "你住在上海" 这种字串不算记得 key fact
    const hasKey = (s: string) =>
      KEY_FACT_AFFIRMATIVE.some(m => s.includes(m)) &&
      !KEY_FACT_NEGATIVE.some(m => s.includes(m));

    let trimReply = "";
    let summarizeReply = "";
    try {
      const out = await callLlmOnce(messagesTrim, modelA, "trim");
      trimReply = out.reply;
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "upstream_failed", stage: "trim", message: (err as Error).message };
      return;
    }
    try {
      const out = await callLlmOnce(messagesSummarize, modelA, "summarize");
      summarizeReply = out.reply;
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "upstream_failed", stage: "summarize", message: (err as Error).message };
      return;
    }

    const trimHas = hasKey(trimReply);
    const summarizeHas = hasKey(summarizeReply);

    const body = {
      config: { historyCount, outputBudget, totalBudget, summarizeFrom, keepRecent, modelA },
      keyFact: KEY_FACT,
      question: RECALL_QUESTION,
      summary,
      beforeBudget,
      trim: {
        messages: messagesTrim,
        reply: trimReply,
        replyTokens: encode(trimReply).length,
        hasKeyFact: trimHas,
        budget: trimBudget,
        droppedFromHistory: trimDropped,
        triggered: trimDropped > 0,
      },
      summarize: {
        messages: messagesSummarize,
        reply: summarizeReply,
        replyTokens: encode(summarizeReply).length,
        hasKeyFact: summarizeHas,
        budget: summarizeBudget,
        droppedFromRecent: summarizeDroppedFromRecent,
      },
      对比小结:
        `trim 路径：${trimHas ? "✅ 记得 key fact" : "❌ 忘了 key fact"}（${trimDropped > 0 ? `丢了 ${trimDropped} 条` : "没丢"}）；` +
        `summarize 路径：${summarizeHas ? "✅ 记得 key fact" : "❌ 忘了 key fact"}（summary 里有，${summarizeDroppedFromRecent > 0 ? `近期被丢 ${summarizeDroppedFromRecent} 条` : "近期全留"}）。` +
        `这就是「丢字面 vs 留语义」的可观察对照。`,
    };

    logger.info("compare.handler", "调用函数结束：compare", "为什么打：要把双策略判定 + 三块预算 + messages 完整结果打到日志；学习者翻日志一眼看见「丢字面 vs 留语义」。当前：3 次 LLM 都已返回（1 次摘要 + 2 次问答）。", {
      返回值: body,
      字段释义: {
        "beforeBudget": "裁前三块预算分账（system + history + output 预留）",
        "trim.budget / summarize.budget": "两条路径裁后的三块预算",
        "trim.droppedFromHistory": "trim 路径丢掉的非 system 消息条数",
        "summarize.droppedFromRecent": "summarize 路径里若仍超预算，丢掉的近期原文条数",
        "trim.hasKeyFact / summarize.hasKeyFact": "两个回答是否命中 key fact（教学点：trim=❌，summarize=✅）",
      },
      耗时ms: Date.now() - tHandler0,
    });

    ctx.body = body;
  });
}
