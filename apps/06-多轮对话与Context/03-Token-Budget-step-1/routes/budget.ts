/**
 * 职责：POST /api/budget —— 演示「Token Budget 三块分账 + 拼装前打印 + 超预算裁剪最旧」。
 *
 * 数据流：
 *   浏览器 fetch { systemText, historyCount, userText, outputBudget, totalBudget }
 *     → Zod 校验
 *       → estimateBudget() 算 system / history / output 三块 token 数（gpt-tokenizer 估算）
 *       → 判断 total > totalBudget → 触发裁剪：丢最旧非 system 消息直到 ≤ totalBudget
 *       → 拼装 messages：[system, ...historyAfterTrim, userText]
 *       → 调真模型（仅 1 次）→ reply
 *       → 返回 { beforeBudget, afterBudget, trimmed, messages, reply, replyTokens }
 *     → React 渲染：① 三块预算分账 ② 裁剪前 messages + token ③ 裁剪后 messages + token ④ 模型回复 ⑤ 触发日志说明
 *
 * 教学锚点（模块 06 · 03 · Token Budget step-1）：
 *   - 「三块预算」= system 段 + history 段 + output 预留；output 不能事后裁，只能预留
 *   - 「拼装前打印 token」= 在 messages = [...] 之前先算账，超了再裁（不是发完 400 再补救）
 *   - 「超预算裁最旧」= 软阈值的第一步（step-1 只演示最简：丢最旧一条；step-N 再加摘要/硬阈值/选择性注入）
 *
 * **不演示**：硬阈值应急、摘要压缩、选择性注入、软阈值/硬阈值双层 —— 这些是 step-N。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { encode } from "gpt-tokenizer";
import { getLlm } from "../../../llm.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  systemText: z.string().min(1).max(2000).default(
    "你是一个有帮助的助手。回答简洁，分点列出要点即可。",
  ),
  historyCount: z.number().int().min(0).max(200).default(50),
  userText: z.string().min(1).max(500).default(
    "总结一下我们前面聊过的 3 个关键点。",
  ),
  outputBudget: z.number().int().min(64).max(4000).default(800),
  totalBudget: z.number().int().min(512).max(32000).default(2000),
});

// 一条假历史（让 historyCount 有内容）：固定套路"第 N 轮闲聊"——便宜、可重复、不抢戏
function buildMockHistory(n: number): Array<{ role: "user" | "assistant"; content: string }> {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (let i = 1; i <= n; i++) {
    out.push({ role: "user", content: `第 ${i} 轮 · 这是一些占位内容用于演示 history 累积。` });
    out.push({ role: "assistant", content: `好的，第 ${i} 轮收到。` });
  }
  return out;
}

// 算一段文本的 token 数（与前端近似口径不同：这里用 gpt-tokenizer 精确一些）
function countTokens(text: string): number {
  return encode(text).length;
}

// 三块预算分账：system / history(裁前) / output
function estimateBudget(systemText: string, history: Array<{ role: string; content: string }>, outputBudget: number) {
  const systemTokens = countTokens(systemText);
  const historyTokens = history.reduce((s, m) => s + countTokens(`${m.role}: ${m.content}`), 0);
  const total = systemTokens + historyTokens + outputBudget;
  return { systemTokens, historyTokens, outputBudget, total };
}

// 软阈值裁剪：丢最旧非 system 消息直到 total ≤ totalBudget（裁 output / system 都不动）
function trimToBudget(
  history: Array<{ role: "user" | "assistant"; content: string }>,
  systemText: string,
  outputBudget: number,
  totalBudget: number,
): { trimmed: Array<{ role: "user" | "assistant"; content: string }>; dropped: number } {
  const sysTokens = countTokens(systemText);
  let tail = history.slice();
  let dropped = 0;
  // 从最旧丢：一次丢 2 条（user+assistant 一对），保持对话轮次完整
  while (tail.length > 0) {
    const cur = tail.reduce((s, m) => s + countTokens(`${m.role}: ${m.content}`), 0);
    const total = sysTokens + cur + outputBudget;
    if (total <= totalBudget) break;
    tail = tail.slice(2);
    dropped += 2;
  }
  return { trimmed: tail, dropped };
}

// 调一次 LLM（不流式）
async function callLlmOnce(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  model: string,
): Promise<{ reply: string; completion: unknown }> {
  const request = { model, messages };
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么写这条日志：这是真正发网络请求的那一次；不写完整 messages 就讲不清「拼装前打印的预算到底对不对」。当前：messages 已按预算裁好，即将发请求。",
    {
      入参: request,
      字段释义: {
        "入参.messages": "拼装后实际发给模型的完整 messages（system + 裁后 history + userText）",
        "入参.model": "本轮用的模型名",
      },
      __code: "const completion = await getLlm().openai.chat.completions.create(request);",
    },
  );
  const t0 = Date.now();
  try {
    const completion = await getLlm().openai.chat.completions.create(request);
    const reply = (completion as { choices: Array<{ message: { content: string | null } }> }).choices[0]?.message?.content ?? "";
    logger.info(
      "││ 调用模型-对话补全",
      "调用模型结束：对话补全",
      "为什么写这条日志：要把完整 completion 写到日志；学习者翻日志能看见输出用了多少 token。当前：await 已返回。",
      {
        返回值: completion,
        replyTokens: encode(reply).length,
        字段释义: {
          "choices[0].message.content": "assistant 这一轮的 content（输出 token ≈ encode(reply).length）",
          "replyTokens": "用 gpt-tokenizer 粗估的回答 token 数",
        },
        耗时ms: Date.now() - t0,
      },
    );
    return { reply, completion };
  } catch (err: unknown) {
    logger.error(
      "││ 调用模型-对话补全",
      "调用模型结束：对话补全（失败）",
      "模型调用本身抛错（限流 / 网络 / 超时）；原始错误对象原样进日志。",
      { error: err, 入参: request, 耗时ms: Date.now() - t0 },
    );
    throw err;
  }
}

export function mountBudgetRoutes(router: Router): void {
  router.post("/api/budget", async (ctx: Context) => {
    // ── ① 入参校验 ──
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: "bad_request", issues: parsed.error.issues };
      logger.warn("budget.bad_request", "调用函数结束：budget（失败）", "入参 Zod 没通过；返回 400 给前端", {
        issues: parsed.error.issues,
      });
      return;
    }
    const { systemText, historyCount, userText, outputBudget, totalBudget } = parsed.data;

    // ── ② 取 LLM 客户端 ──
    let modelA: string;
    try {
      modelA = getLlm().modelA;
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "no_llm", message: (err as Error).message };
      logger.error("budget.no_llm", "调用函数结束：budget（失败）", "getLlm 抛错；apps/.env 没配当前提供商的 Key", {
        error: err,
      });
      return;
    }

    // ── ③ 拼装 history + 算三块预算（裁前）──
    const history = buildMockHistory(historyCount);
    const tHandler0 = Date.now();
    logger.info("budget.handler", "调用函数开始：budget", "为什么写这条日志：路由是 Token Budget 演示的唯一入口；不写完整数据流下面就讲不清「三块预算怎么算、超了怎么裁」。当前：假历史已拼好，即将算账 + 决定是否裁。", {
      入参: { systemText, historyCount, userText, outputBudget, totalBudget, modelA },
      字段释义: {
        "systemText": "系统提示原文",
        "historyCount": "生成的假 history 轮数（每轮 = user + assistant 2 条）",
        "userText": "本轮 user 输入",
        "outputBudget": "给模型留的输出 token 上限（不能事后裁，只能预留）",
        "totalBudget": "三块合计的硬上限；超了就丢最旧非 system 消息",
        "modelA": "来自 apps/.env 顶层 LLM_MODEL 或该家默认",
      },
      __code: "const history = buildMockHistory(historyCount); estimateBudget(systemText, history, outputBudget);",
    });

    const beforeBudget = estimateBudget(systemText, history, outputBudget);

    // ── ④ 触发裁剪（仅丢最旧；output/system 不动）──
    const { trimmed, dropped } = trimToBudget(history, systemText, outputBudget, totalBudget);
    const afterBudget = estimateBudget(systemText, trimmed, outputBudget);

    logger.info("budget.trim", "调用函数结束：trimToBudget", "为什么写这条日志：要把裁剪前后的 token 数都写到日志；学习者一眼看见「超了 → 丢最旧 → total ≤ budget」。当前：已返回新 history。", {
      入参: { systemText, historyCount, outputBudget, totalBudget },
      返回值: { trimmed, dropped, beforeBudget, afterBudget },
      字段释义: {
        "返回值.trimmed": "裁剪后保留的 history（从尾往旧累加，配 system/output 后 ≤ totalBudget 才停）",
        "返回值.dropped": "丢掉的非 system 消息条数（按 user/assistant 对丢，保证对话轮次完整）",
        "返回值.beforeBudget": "裁前三块预算分账",
        "返回值.afterBudget": "裁后三块预算分账",
      },
    });

    // ── ⑤ 拼装 messages + 调真模型 ──
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemText },
      ...trimmed,
      { role: "user", content: userText },
    ];

    let reply = "";
    try {
      const out = await callLlmOnce(messages, modelA);
      reply = out.reply;
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = {
        error: "upstream_failed",
        message: (err as Error).message,
      };
      return;
    }

    const replyTokens = encode(reply).length;
    const body = {
      config: { systemText, historyCount, userText, outputBudget, totalBudget, modelA },
      beforeBudget,
      afterBudget,
      dropped,
      triggered: afterBudget.total < beforeBudget.total,  // 实际是否裁了
      messages,
      reply,
      replyTokens,
      触发说明: afterBudget.total < beforeBudget.total
        ? `超预算：裁前 total=${beforeBudget.total} > ${totalBudget}；按「丢最旧非 system」裁掉 ${dropped} 条 → 裁后 total=${afterBudget.total} ≤ ${totalBudget}。`
        : `未超预算：total=${beforeBudget.total} ≤ ${totalBudget}，没触发裁剪。`,
    };

    logger.info("budget.handler", "调用函数结束：budget", "为什么写这条日志：要把本路由完整出参写到日志；学习者翻日志一眼看见「预算算账 → 是否裁 → 真调模型」。当前：模型已返回。", {
      返回值: body,
      字段释义: {
        "beforeBudget / afterBudget": "裁前/裁后三块预算分账",
        "dropped": "丢掉的 history 条数",
        "triggered": "本次是否真触发了裁剪",
        "messages": "拼装后实际发给模型的完整 messages",
        "reply": "模型本轮回答原文",
        "replyTokens": "回答的 token 数（与 outputBudget 对照看是否留够）",
      },
      耗时ms: Date.now() - tHandler0,
    });

    ctx.body = body;
  });
}
