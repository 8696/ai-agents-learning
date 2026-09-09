/**
 * 职责：POST /api/emergency —— 演示「软阈值 + 硬阈值双层」：同一份 history 走两条路径对照。
 *       软路径：total ≤ hardLimit → 走 step-2 同款（trim 或 summarize 二选一）
 *       硬路径：total > hardLimit → 应急模式 = 只保留 system + 最新 1 轮 + 提示"对话太长,请重述"
 *
 * 数据流：
 *   浏览器 fetch { historyCount, outputBudget, totalBudget, hardLimit, summarizeFrom, keepRecent, strategy }
 *     → Zod 闸门
 *       → buildMockHistory(historyCount)
 *       → estimateBudget(system, history, output)
 *       → if beforeBudget.total > hardLimit → 硬路径(emergency):
 *           messages = [system, history 最后 1 条(user 或 assistant)+ 提示 user 消息]
 *           → 调真模型 → emergencyReply
 *         else → 软路径(soft):
 *           if strategy === "trim" → 丢最旧非 system 直到 fit
 *           if strategy === "summarize" → 远期摘要 + 近期原文
 *           → 调真模型 → softReply
 *       → 返回 { mode, soft, emergency, beforeBudget, 触发说明, ... }
 *     → React 5 张卡：① 触发说明 + 软硬判定 ② 软路径(策略 + 完整 messages + 回复)  ③ 硬路径(应急 messages + 回复)  ④ summary 原文  ⑤ 裁前基线
 *
 * 教学锚点（模块 06 · 03 · Token Budget step-3）：
 *   - 「软阈值」= step-1/step-2 的丢最旧 / 摘要;**仍可能超硬阈值**(用户疯狂发超长消息,trim/summarize 都救不回来)
 *   - 「硬阈值应急」= **不要 400,不要静默截断,直接砍到只剩 system + 最新 1 轮 + 提示用户重述**
 *   - 「50+ 轮不崩」= 有硬阈值兜底,系统永远在「能发请求」状态
 *   - 演示用真 LLM;emergency 路径只有 3 条 messages(最经济);soft 路径同 step-2
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
  hardLimit: z.number().int().min(256).max(16000).default(1000),
  summarizeFrom: z.number().int().min(1).max(200).default(40),
  keepRecent: z.number().int().min(0).max(50).default(8),
  strategy: z.enum(["trim", "summarize"]).default("trim"),
}).refine(v => v.hardLimit >= v.outputBudget + 32, {
  message: "hardLimit 必须 ≥ outputBudget + 32(给 output 留够空间,再小就要么超窗口要么没输出)",
  path: ["hardLimit"],
});

// 软阈值 = step-2 的 system prompt(教学上要一致)
const SYSTEM_PROMPT =
  "你是一个有帮助的助手。回答简洁,分点列出要点即可。";

// 应急模式 = 砍到只剩 system + 最新 1 轮 + 提示用户重述
const EMERGENCY_HINT =
  "【系统提示】对话历史过长,已被压缩。请你用最简洁的一句话告诉用户:对话太长,请他用一句话重新描述他想做什么。不要假装记得之前聊过什么。";

// ── 生成 mock history ──
function buildMockHistory(n: number): Array<{ role: "user" | "assistant"; content: string }> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (let i = 1; i <= n; i++) {
    out.push({ role: "user", content: `第 ${i} 轮 · 这是一些占位内容用于演示 history 累积。` });
    out.push({ role: "assistant", content: `好的,第 ${i} 轮收到。` });
  }
  return out;
}

function countTokens(text: string): number {
  return encode(text).length;
}

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

// trim(同 step-2)
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

// summarize(同 step-2 思路,但单条 prompt)
const SUMMARIZE_INSTRUCTION =
  "你是一个「对话历史总结器」。用 150 字以内总结这段对话的关键事实(用户偏好/提到的具体事项)。只输出总结正文,不要前缀/不要对话延续/不要解释。";
async function summarizeOld(
  oldMessages: Array<{ role: "user" | "assistant"; content: string }>,
  model: string,
): Promise<string> {
  const transcript = oldMessages
    .map((m, i) => `[${m.role}] (第 ${i + 1} 条) ${m.content}`)
    .join("\n");
  const userPrompt = `以下是一段历史对话(共 ${oldMessages.length} 条,已结束):\n\n${transcript}\n\n---\n\n请按 system 指令总结。`;
  const completion = await getLlm().openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SUMMARIZE_INSTRUCTION },
      { role: "user", content: userPrompt },
    ],
  });
  return completion.choices[0]?.message?.content ?? "";
}

// 调一次 LLM(不流式)
async function callLlmOnce(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  model: string,
  stage: string,
): Promise<{ reply: string; completion: unknown }> {
  const request = { model, messages };
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全",
    `为什么打：真出网那一次。当前：${stage}。`,
    { 入参: request, stage, __code: "const completion = await getLlm().openai.chat.completions.create(request);" },
  );
  const t0 = Date.now();
  try {
    const completion = await getLlm().openai.chat.completions.create(request);
    const reply = (completion as { choices: Array<{ message: { content: string | null } }> }).choices[0]?.message?.content ?? "";
    logger.info(
      "││ 调用模型-对话补全",
      "调用模型结束：对话补全",
      `为什么打：要把完整 completion 打到日志。当前：${stage} 已返回。`,
      { 返回值: completion, stage, replyTokens: encode(reply).length, 耗时ms: Date.now() - t0 },
    );
    return { reply, completion };
  } catch (err: unknown) {
    logger.error(
      "││ 调用模型-对话补全",
      "调用模型结束：对话补全（失败）",
      "模型调用抛错。",
      { error: err, stage, 入参: request, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
}

export function mountEmergencyRoutes(router: Router): void {
  router.post("/api/emergency", async (ctx: Context) => {
    // ── ① 入参闸门 ──
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: "bad_request", issues: parsed.error.issues };
      logger.warn("emergency.bad_request", "调用函数结束：emergency（失败）", "入参 Zod 没通过", { issues: parsed.error.issues });
      return;
    }
    const { historyCount, outputBudget, totalBudget, hardLimit, summarizeFrom, keepRecent, strategy } = parsed.data;

    // ── ② 取 LLM 客户端 ──
    let modelA: string;
    try {
      modelA = getLlm().modelA;
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "no_llm", message: (err as Error).message };
      logger.error("emergency.no_llm", "调用函数结束：emergency（失败）", "getLlm 抛错", { error: err });
      return;
    }

    const history = buildMockHistory(historyCount);
    const tHandler0 = Date.now();
    const beforeBudget = estimateBudget(SYSTEM_PROMPT, history, outputBudget);

    logger.info("emergency.handler", "调用函数开始：emergency", "为什么打：路由是软硬双层演示的唯一入口。当前：拼好 history + 算裁前预算,即将判定走软还是硬。", {
      入参: { historyCount, outputBudget, totalBudget, hardLimit, summarizeFrom, keepRecent, strategy, modelA },
      beforeBudget,
      字段释义: {
        "historyCount": "假历史轮数(每轮 2 条)",
        "outputBudget": "给模型输出的预留",
        "totalBudget": "软阈值:超了走 trim/summarize",
        "hardLimit": "硬阈值:超了直接走应急(只留 system + 最新 1 轮 + 提示重述)",
        "summarizeFrom / keepRecent": "summarize 路径的远期/近期切分",
        "strategy": "软路径的策略(trim/summarize 二选一)",
        "beforeBudget": "裁前三块预算(用于判定)",
      },
    });

    // ── ③ 判定软 / 硬 ──
    const mode: "emergency" | "soft" = beforeBudget.total > hardLimit ? "emergency" : "soft";

    let soft: { messages: unknown[]; reply: string; replyTokens: number; budget: unknown; summary: string; mode: string; dropped?: number } | null = null;
    let emergency: { messages: unknown[]; reply: string; replyTokens: number; budget: unknown } | null = null;

    if (mode === "emergency") {
      // 硬路径:只留 system + history 末轮 + 提示 user
      const lastMessage = history[history.length - 1];
      const emergencyMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: SYSTEM_PROMPT },
        lastMessage,
        { role: "user", content: EMERGENCY_HINT },
      ];
      const emergencyBudget = estimateBudget(SYSTEM_PROMPT, [lastMessage], outputBudget);
      try {
        const out = await callLlmOnce(emergencyMessages, modelA, "emergency");
        emergency = {
          messages: emergencyMessages,
          reply: out.reply,
          replyTokens: encode(out.reply).length,
          budget: emergencyBudget,
        };
      } catch (err: unknown) {
        ctx.status = 502;
        ctx.body = { error: "upstream_failed", stage: "emergency", message: (err as Error).message };
        return;
      }
    } else {
      // 软路径:trim 或 summarize
      let trimmed = history;
      let dropped = 0;
      let summary = "";
      if (strategy === "trim") {
        ({ trimmed, dropped } = trimToBudget(history, SYSTEM_PROMPT, outputBudget, totalBudget));
      } else {
        const oldForSummary = history.slice(0, Math.min(summarizeFrom, history.length));
        const recentOriginal = history.slice(Math.min(summarizeFrom, history.length)).slice(-keepRecent);
        try {
          summary = await summarizeOld(oldForSummary, modelA);
        } catch (err: unknown) {
          ctx.status = 502;
          ctx.body = { error: "upstream_failed", stage: "summarize", message: (err as Error).message };
          return;
        }
        const summaryMessage = { role: "assistant" as const, content: `【历史对话摘要】\n${summary}` };
        trimmed = [summaryMessage, ...recentOriginal];
      }
      const softMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: SYSTEM_PROMPT },
        ...trimmed,
        { role: "user", content: "总结一下我们前面聊过的 3 个关键点。" },
      ];
      const softBudget = estimateBudget(SYSTEM_PROMPT, trimmed, outputBudget);
      try {
        const out = await callLlmOnce(softMessages, modelA, `soft-${strategy}`);
        soft = {
          messages: softMessages,
          reply: out.reply,
          replyTokens: encode(out.reply).length,
          budget: softBudget,
          summary,
          mode: strategy,
          dropped: strategy === "trim" ? dropped : undefined,
        };
      } catch (err: unknown) {
        ctx.status = 502;
        ctx.body = { error: "upstream_failed", stage: "soft", message: (err as Error).message };
        return;
      }
    }

    const body = {
      config: { historyCount, outputBudget, totalBudget, hardLimit, summarizeFrom, keepRecent, strategy, modelA },
      beforeBudget,
      mode,
      soft,
      emergency,
      触发说明: mode === "emergency"
        ? `超硬阈值：裁前 total=${beforeBudget.total} > hardLimit=${hardLimit} → 应急模式 = 只保留 system + history 末轮 + 提示"请用一句话重述"。`
        : `软路径：裁前 total=${beforeBudget.total} ≤ hardLimit=${hardLimit},走${strategy === "trim" ? "丢最旧" : "摘要压缩"}策略。`,
    };

    logger.info("emergency.handler", "调用函数结束：emergency", "为什么打：要把本路由完整出参打到日志。当前：模型已返回。", {
      返回值: body,
      mode,
      耗时ms: Date.now() - tHandler0,
    });

    ctx.body = body;
  });
}
