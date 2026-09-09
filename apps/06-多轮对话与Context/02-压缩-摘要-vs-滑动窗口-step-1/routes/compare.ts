/**
 * 职责：POST /api/compare —— 滑动窗口裁剪前 vs 裁剪后，两次真调 LLM，对比模型回答。
 *       把「滑动窗口丢了什么」变成可观察结果（不是抽象描述）。
 *
 * 数据流：
 *   浏览器 fetch { turnCount, windowSize, keyFactAtTurn }
 *     → Zod 闸门
 *       → buildMockHistory() 生成 N 轮假对话：第 K 轮 user 说「自我介绍」含 key fact；最后一轮 user 问「你还记得吗」
 *         → messagesBefore = [system, ...mockHistory]                       ← 完整
 *         → callLlmOnce(messagesBefore + 问句) → beforeReply                 ← 调真模型 #1
 *         → slidingWindowTrim(messagesBefore, windowSize) → messagesAfter   ← 系统提示永远 pin + 留最近 K 条
 *         → callLlmOnce(messagesAfter + 问句) → afterReply                   ← 调真模型 #2
 *       → 出参 { messagesBefore, messagesAfter, beforeReply, afterReply, keyFact, question }
 *     → React 三张卡片：① 裁剪前 messages + beforeReply  ② 裁剪后 messages + afterReply  ③ 对比小结
 *
 * 教学锚点（模块 06 · 02 · 滑动窗口 step-1）：
 *   - 「滑动窗口」= 按条数 K 截断；system 永远 pin；保留最近 K 条 user/assistant
 *   - 「丢了什么」= 当 key fact 落在窗口外 → 模型「忘了」那个事实
 *   - 「什么时候该用」= 模型回答里能找到 key fact（before） vs 找不到（after）—— 一眼对比
 *   - 演示用真 LLM；mock history 不调模型（只是拼出 messages 数组让模型读）
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { encode } from "gpt-tokenizer";
import { getLlm } from "../../../llm.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  turnCount: z.number().int().min(2).max(80).default(50),
  windowSize: z.number().int().min(2).max(80).default(6),
  keyFactAtTurn: z.number().int().min(1).max(80).default(1),
});

// 系统提示：明确让模型在回答里复读关键事实（方便教学对比时一眼看有没有「丢」）
const SYSTEM_PROMPT =
  "你是一个有帮助的助手。用户会在历史对话里告诉你关于他/她自己的事实（姓名、所在地、偏好等）。" +
  "当用户问「你还记得我叫什么、住哪、喜欢什么」时，请尽量根据历史对话回答；" +
  "回答要简洁，分点列出你记得的事实即可。";

// 关键的「自我介绍」句子（教学锚点：这一句就是「要被滑动窗口丢掉的 key fact」）
const KEY_FACT =
  "你好，我先自我介绍一下：我叫 Tina，住在上海，最喜欢的菜是日料，尤其是寿司和拉面。";

// 「问对比问题」——模型需要从历史里找出 key fact 才能答出
const RECALL_QUESTION = "现在问题来了——你还记得我叫什么、住哪、最喜欢吃什么吗？请分点回答。";

// ── 生成 mock history ──
// 第 keyFactAtTurn 轮是「自我介绍」；最后一轮是「你还记得吗」（由调用方 append，单独存）。
// 中间其余轮是闲聊 user/assistant 交替 —— 让模型看到「这段历史真的发生过」而不是凭空。
function buildMockHistory(turnCount: number, keyFactAtTurn: number): Array<{ role: "user" | "assistant"; content: string }> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  // turnCount 包含「自我介绍」轮；总 user/assistant 对约 turnCount 条 user + turnCount 条 assistant
  // 我们让中间填充 (turnCount - 2) 对闲聊，再把「自我介绍」插在 keyFactAtTurn 位置
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
      // 自我介绍之后给一个普通的助手回应（让对话「接得上」）
      out.push({ role: "assistant", content: "你好 Tina！已记住你住在上海、喜欢日料。有什么我可以帮你的吗？" });
    } else {
      // 闲聊：user 一个问题，assistant 一个简短回答
      const topic = fillerTopics[(i - 1) % fillerTopics.length];
      out.push({ role: "user", content: `第 ${i} 轮 · ${topic}` });
      out.push({ role: "assistant", content: `好的，关于「${topic}」我先简单回应一下。` });
    }
  }
  return out;
}

// ── 滑动窗口裁剪 ──
// 规则：system 永远 pin 在最前；非 system 消息里只保留最后 K 条；保持顺序。
// 这是「按条数窗口」的最小实现 —— 真实生产里通常改成按 token 算（参 §5.3.x 变体 2）。
function slidingWindowTrim(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  windowSize: number,
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const systemMsgs = messages.filter(m => m.role === "system");
  const rest = messages.filter(m => m.role !== "system");
  const tail = rest.slice(-windowSize);
  return [...systemMsgs, ...tail];
}

// ── 调一次 LLM（不流式）──
// 真正出网；五件套打在这里：入参 = 完整 request，返回值 = 完整 completion（§5.3.16 禁止摘要）
async function callLlmOnce(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  model: string,
  stage: "before" | "after",
): Promise<string> {
  const request = { model, messages };
  const tokensEstimate = encode(messages.map(m => `${m.role}: ${m.content}`).join("\n")).length;
  logger.info(
    "││ 调用模型-对比补全",
    "调用模型开始：对比补全",
    `为什么打：这是真出网的那一次，不打完整 messages 就讲不清「滑动窗口丢的 key fact」是不是真的导致模型「忘」。当前：stage=${stage}（${stage === "before" ? "完整历史" : "滑动窗口裁剪后"}）+ 同一问句。`,
    {
      入参: request,
      tokensEstimate,
      stage,
      字段释义: {
        "入参.messages": "实际发给模型的完整 messages（含 system / 历史 / 问句）",
        "入参.model": "本轮用的模型名",
        "stage": "before = 完整 messages；after = 滑动窗口裁剪后",
        "tokensEstimate": "拼成字符串后用 gpt-tokenizer 粗估的 token 数（并存，不代替 messages）",
      },
      本轮为什么是这些参数: {
        "stage": "教学对照：同一问题、同一模型、唯独 messages 不同",
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
      "调用模型结束：对比补全",
      `为什么打：要把完整 completion 打到日志，对照 key fact 是否还在。当前：stage=${stage} 已返回。`,
      {
        返回值: completion,
        stage,
        replyTokens: encode(reply).length,
        字段释义: {
          "choices[0].message.content": "assistant 这一轮的 content（对照是否含 Tina / 上海 / 日料）",
          "replyTokens": "用 gpt-tokenizer 粗估的回答 token 数（并存）",
        },
        耗时ms: Date.now() - t0,
      },
    );
    return reply;
  } catch (err: unknown) {
    logger.error(
      "││ 调用模型-对比补全",
      "调用模型结束：对比补全（失败）",
      `模型调用本身抛错（限流 / 网络 / 超时）；原始错误对象原样进日志。当前：stage=${stage} 失败。`,
      { error: err, stage, 入参: request, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
}

export function mountCompareRoutes(router: Router): void {
  router.post("/api/compare", async (ctx: Context) => {
    // ── ① 入参闸门：防 malformed body ──
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: "bad_request", issues: parsed.error.issues };
      logger.warn("compare.bad_request", "调用函数结束：compare（失败）", "入参 Zod 没通过；返回 400 给前端", {
        issues: parsed.error.issues,
      });
      return;
    }
    const { turnCount, windowSize, keyFactAtTurn } = parsed.data;

    // ── ② 取 LLM 客户端（缺 Key 直接 502 让前端知道）──
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

    // ── ③ 拼装 messages 数组 ──
    const mockHistory = buildMockHistory(turnCount, keyFactAtTurn);
    const messagesBefore: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...mockHistory,
      { role: "user", content: RECALL_QUESTION },
    ];

    const tHandler0 = Date.now();
    logger.info("compare.handler", "调用函数开始：compare", "为什么打：路由是滑动窗口对照实验的唯一入口；不打完整数据流下面就讲不清「滑动窗口到底丢了什么」。当前：假历史已拼好，即将裁剪 + 调两次模型。", {
      入参: { turnCount, windowSize, keyFactAtTurn, modelA, messagesBefore },
      字段释义: {
        "turnCount": "生成的假对话轮数（不含系统提示；含 key fact 那一轮）",
        "windowSize": "滑动窗口保留的非 system 消息条数（K）",
        "keyFactAtTurn": "key fact「自我介绍」放在第几轮；改这个可以演示「key fact 在窗口内 vs 窗口外」",
        "modelA": "来自 apps/.env 顶层 LLM_MODEL 或该家默认",
        "messagesBefore": "裁剪前完整 messages（system + 假历史 + 问句）",
      },
      本轮为什么是这些参数: {
        "turnCount": "演示长对话；50 轮确保超过大多数窗口 K=6 的容量",
        "windowSize": "6 是经验值：50 轮假对话 → window=6 时 key fact 在第 1 轮 → 必丢；改成 50 则必留",
        "keyFactAtTurn": "1 = key fact 放在最早；改成 49 则必留；这是教学对照的关键旋钮",
      },
      __code: "messagesBefore = [system, ...mockHistory, {role:'user', content:RECALL_QUESTION}];",
    });

    // ── ④ 本地裁剪（不调模型）；真正出网在 callLlmOnce 里 ──
    logger.info("│ 调用函数-滑动窗口", "调用函数开始：slidingWindowTrim", "为什么打：纯本地裁剪，不调模型；不打完整 messages 就讲不清「裁剪后长什么样」。当前：messagesBefore 已就绪，即将按 K 裁。", {
      入参: { messages: messagesBefore, windowSize },
      __code: "const messagesAfter = slidingWindowTrim(messagesBefore, windowSize);",
    });
    const tTrim0 = Date.now();
    const messagesAfter = slidingWindowTrim(messagesBefore, windowSize);
    logger.info("│ 调用函数-滑动窗口", "调用函数结束：slidingWindowTrim", "为什么打：要把裁剪后的完整 messages 打到日志；对照 before 一眼看见丢了哪几条。当前：已返回新数组。", {
      返回值: messagesAfter,
      dropped: messagesBefore.length - messagesAfter.length,
      keyFactPresent: messagesAfter.some(m => m.content.includes("我叫 Tina")),
      字段释义: {
        "返回值": "裁剪后完整 messages（system pin + 最近 K 条非 system）",
        "dropped": "本轮丢掉的消息条数（并存统计）",
        "keyFactPresent": "key fact「我叫 Tina」是否还在裁剪后的 messages 里（false = 丢了）",
      },
      耗时ms: Date.now() - tTrim0,
    });

    // ── ⑤ 调真模型两次：裁剪前 + 裁剪后（五件套在 callLlmOnce 内）──
    const results: Array<{ stage: string; reply: string; durationMs: number }> = [];

    for (const stage of ["before", "after"] as const) {
      const messages = stage === "before" ? messagesBefore : messagesAfter;
      const t0 = Date.now();
      try {
        const reply = await callLlmOnce(messages, modelA, stage);
        results.push({ stage, reply, durationMs: Date.now() - t0 });
      } catch (err: unknown) {
        ctx.status = 502;
        ctx.body = {
          error: "upstream_failed",
          stage,
          message: (err as Error).message,
        };
        return;
      }
    }

    const beforeReply = results.find(r => r.stage === "before")?.reply ?? "";
    const afterReply = results.find(r => r.stage === "after")?.reply ?? "";
    const beforeHasKeyFact = beforeReply.includes("Tina") || beforeReply.includes("上海") || beforeReply.includes("日料");
    const afterHasKeyFact = afterReply.includes("Tina") || afterReply.includes("上海") || afterReply.includes("日料");
    const dropped = messagesBefore.length - messagesAfter.length;

    const body = {
      config: { turnCount, windowSize, keyFactAtTurn, modelA },
      keyFact: KEY_FACT,
      question: RECALL_QUESTION,
      messagesBefore,
      messagesAfter,
      beforeReply,
      afterReply,
      keyFactInBefore: beforeHasKeyFact,
      keyFactInAfter: afterHasKeyFact,
      dropped,
    };

    logger.info("compare.handler", "调用函数结束：compare", "为什么打：要把本路由完整出参打到日志；学习者事后翻日志一眼就能验证「before 有 / after 没有」。当前：两次 LLM 都已返回。", {
      返回值: body,
      字段释义: {
        "messagesBefore / messagesAfter": "裁剪前后完整 messages",
        "beforeReply / afterReply": "两次模型回答原文",
        "keyFactInBefore / keyFactInAfter": "回答里是否命中 Tina / 上海 / 日料",
        "dropped": "丢掉的消息条数",
      },
      耗时ms: Date.now() - tHandler0,
    });

    ctx.body = body;
  });
}
