/**
 * 职责：POST /api/selective —— 演示「选择性注入」:50 段多话题 history + 1 个 query,
 *       只把命中关键词的 N 段塞进 messages,其他段全部不进 messages(对照"全塞基线")。
 *
 * 数据流：
 *   浏览器 fetch { query, keywords(逗号分隔), selectN, fullHistory, userText }
 *     → Zod 校验
 *       → 多话题 history = 5 段(天气/美食/工作/电影/健身)× 10 轮,共 50 段 user+assistant
 *       → 算每段命中关键词数 → 取 top-N 命中段
 *       → 路径 A(全塞基线):messages = [system, ...全 50 段 history, userText] → 调真模型 → fullReply
 *       → 路径 B(选择性):messages = [system, ...top-N 命中段, userText] → 调真模型 → selectiveReply
 *       → 命中明细:每段 {topic, hits:[关键词], score, picked}
 *     → React 5 张卡:① 触发说明 ② 全塞基线 ③ 选择性注入 ④ 对比小结(token 差 / 回答质量) ⑤ 命中明细
 *
 * 教学锚点（模块 06 · 03 · Token Budget step-4）：
 *   - 「选择」= 按 query 内容选,不是按时间最近选
 *   - 「不进 messages」才是真省 token(对比"全塞基线"看差多少)
 *   - 关键词匹配 = 最简单的"相关"判定;生产里用 embedding 余弦(模块 08 RAG)
 *   - 极端场景:query 相关的话题在很早以前 → step-1~3 全丢光,step-4 反而找回来
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { z } from "zod";
import { encode } from "gpt-tokenizer";
import { getLlm } from "../../../llm.js";
import { logger } from "../lib/logger.js";

const bodySchema = z.object({
  query: z.string().min(1).max(200).default("上次那个寿司店叫什么?"),
  keywords: z.string().min(1).max(500).default("寿司,拉面,日料,餐厅,美食,上海"),
  selectN: z.number().int().min(1).max(20).default(3),
  userText: z.string().min(1).max(500).default("根据对话历史回答用户的问题。"),
});

const SYSTEM_PROMPT =
  "你是一个有帮助的助手。请根据对话历史回答用户问题,只引用相关历史中的内容;如果历史里没提到,直接说没提到。";

// ── 5 段多话题(每段 10 轮 user + assistant 交替,共 50 段)──
// 顺序故意打乱:不是按"时间"排列,而是按"话题"分组
// 段 1-10: 美食(寿司店有具体名)
// 段 11-20: 天气
// 段 21-30: 工作
// 段 31-40: 电影
// 段 41-50: 健身
const TOPICS: Array<{
  topic: string;
  turns: Array<{ user: string; assistant: string }>;
}> = [
  {
    topic: "美食",
    turns: Array.from({ length: 10 }, (_, i) => ({
      user: `美食 ${i + 1}: 我${["", "最近", "上周"][i % 3]}在${["静安", "徐汇", "浦东"][i % 3]}找了家${["寿司店", "拉面馆", "日料店", "意大利餐厅", "火锅店"][i % 5]},叫「${["鮨�的", "�的", "�的味", "�的寿司", "�的面"][i % 5]}${["一�的", "�的", "�的", "�的味", "�的鲜"][i % 5]}」,人均${100 + i * 10}。`,
      assistant: `好的,记下「${i + 1}号店」了,人均 ${100 + i * 10},${["寿司", "拉面", "日料", "意餐", "火锅"][i % 5]}。`,
    })),
  },
  {
    topic: "天气",
    turns: Array.from({ length: 10 }, (_, i) => ({
      user: `天气 ${i + 1}: 今天${["", "明天", "这周"][i % 3]}上海${["晴", "多云", "小雨", "暴雨"][i % 4]},气温 ${20 + i} 度。`,
      assistant: `${["", "明天", "这周"][i % 3]}上海${["晴", "多云", "小雨", "暴雨"][i % 4]},${20 + i} 度,${["适合出门", "带伞", "多穿件外套", "减少外出"][i % 4]}。`,
    })),
  },
  {
    topic: "工作",
    turns: Array.from({ length: 10 }, (_, i) => ({
      user: `工作 ${i + 1}: 项目进度${["正常", "延迟", "提前"][i % 3]},这周要交 ${i + 1} 个需求。`,
      assistant: `收到,${i + 1} 个需求,${["正常", "延迟", "提前"][i % 3]}交付,我帮你排个优先级。`,
    })),
  },
  {
    topic: "电影",
    turns: Array.from({ length: 10 }, (_, i) => ({
      user: `电影 ${i + 1}: 推荐一部${["动作", "喜剧", "悬疑", "科幻", "文艺"][i % 5]}片?`,
      assistant: `《${["碟中谍", "夏洛特烦恼", "看不见的客人", "星际穿越", "小偷家族"][i % 5]}${[" 7", " 8", " 9", " 10", ""][i % 5]}》,IMDb 8+。`,
    })),
  },
  {
    topic: "健身",
    turns: Array.from({ length: 10 }, (_, i) => ({
      user: `健身 ${i + 1}: 今天${["跑步", "游泳", "撸铁", "瑜伽", "爬山"][i % 5]} ${20 + i} 分钟。`,
      assistant: `${["跑步", "游泳", "撸铁", "瑜伽", "爬山"][i % 5]} ${20 + i} 分钟,${["消耗约 200", "消耗约 300", "消耗约 400", "消耗约 150", "消耗约 500"][i % 5]} 千卡。`,
    })),
  },
];

// 把所有 turn 摊平成 messages 数组,每条带 topic 标记
function buildMultiTopicHistory(): Array<{ role: "user" | "assistant"; content: string; topic: string; turnIndex: number }> {
  const out: Array<{ role: "user" | "assistant"; content: string; topic: string; turnIndex: number }> = [];
  for (const t of TOPICS) {
    for (let i = 0; i < t.turns.length; i++) {
      out.push({ role: "user", content: t.turns[i].user, topic: t.topic, turnIndex: i + 1 });
      out.push({ role: "user", content: t.turns[i].assistant, topic: t.topic, turnIndex: i + 1 });
    }
  }
  return out;
}

// 算一段里命中了哪些关键词
function matchKeywords(content: string, kwList: string[]): string[] {
  const hits: string[] = [];
  for (const kw of kwList) {
    const trimmed = kw.trim();
    if (!trimmed) continue;
    if (content.includes(trimmed)) hits.push(trimmed);
  }
  return hits;
}

async function callLlmOnce(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  model: string,
  stage: string,
): Promise<{ reply: string; completion: unknown }> {
  const request = { model, messages };
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全",
    `为什么写这条日志：真正发网络请求那一次。当前：${stage}。`,
    { 入参: request, stage, __code: "const completion = await getLlm().openai.chat.completions.create(request);" },
  );
  const t0 = Date.now();
  try {
    const completion = await getLlm().openai.chat.completions.create(request);
    const reply = (completion as { choices: Array<{ message: { content: string | null } }> }).choices[0]?.message?.content ?? "";
    logger.info(
      "││ 调用模型-对话补全",
      "调用模型结束：对话补全",
      `为什么写这条日志：要把完整 completion 写到日志。当前：${stage} 已返回。`,
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

export function mountSelectiveRoutes(router: Router): void {
  router.post("/api/selective", async (ctx: Context) => {
    // ── ① 入参校验 ──
    const parsed = bodySchema.safeParse(ctx.request.body ?? {});
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: "bad_request", issues: parsed.error.issues };
      logger.warn("selective.bad_request", "调用函数结束：selective（失败）", "入参 Zod 没通过", { issues: parsed.error.issues });
      return;
    }
    const { query, keywords, selectN, userText } = parsed.data;
    const kwList = keywords.split(/[,，]/).map(s => s.trim()).filter(Boolean);

    // ── ② 取 LLM 客户端 ──
    let modelA: string;
    try {
      modelA = getLlm().modelA;
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "no_llm", message: (err as Error).message };
      logger.error("selective.no_llm", "调用函数结束：selective（失败）", "getLlm 抛错", { error: err });
      return;
    }

    const tHandler0 = Date.now();
    const history = buildMultiTopicHistory();

    // ── ③ 算每段命中分数(topic 分组)──
    const topicGroups = TOPICS.map(t => {
      const turnHits = t.turns.map((turn, idx) => {
        const userHits = matchKeywords(turn.user, kwList);
        const assistantHits = matchKeywords(turn.assistant, kwList);
        const score = userHits.length + assistantHits.length;
        return { topic: t.topic, turnIndex: idx + 1, userHits, assistantHits, score };
      });
      const totalScore = turnHits.reduce((s, x) => s + x.score, 0);
      return { topic: t.topic, totalScore, turns: turnHits };
    });
    // 把所有"段"(user 消息)按 score 降序排
    const allTurns = topicGroups.flatMap(g => g.turns).sort((a, b) => b.score - a.score);
    const picked = allTurns.slice(0, selectN);

    logger.info("selective.handler", "调用函数开始：selective", "为什么写这条日志：路由是选择性注入演示的唯一入口。当前：多话题 history + 关键词匹配算出命中段 + 取 topN,即将调两次真模型。", {
      入参: { query, keywords, kwList, selectN, userText, modelA, historyLength: history.length, topicGroups },
      字段释义: {
        "query": "用户当前问的问题(决定「相关」)",
        "keywords": "逗号分隔的关键词列表(可改;越具体匹配越准)",
        "selectN": "取 top-N 命中段(默认 3;改 N 看 token 变化)",
        "historyLength": "多话题 history 总条数(50 段 user+assistant)",
        "topicGroups": "5 个话题分组的命中分数明细",
      },
    });

    // ── ④ 路径 A:全塞基线 ──
    const fullMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map(h => ({ role: h.role, content: `${h.content}\n（话题:${h.topic}）` })),
      { role: "user", content: `${userText}\n\n当前问题:${query}` },
    ];
    const fullBudget = encode(fullMessages.map(m => `${m.role}: ${m.content}`).join("\n")).length;
    let fullReply = "";
    try {
      const out = await callLlmOnce(fullMessages, modelA, "full");
      fullReply = out.reply;
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "upstream_failed", stage: "full", message: (err as Error).message };
      return;
    }

    // ── ⑤ 路径 B:选择性注入(只 picked 段)──
    const selectiveHistory: Array<{ role: "user" | "assistant"; content: string; topic: string }> = [];
    for (const p of picked) {
      const topicTurns = history.filter(h => h.topic === p.topic && h.turnIndex === p.turnIndex);
      selectiveHistory.push(...topicTurns);
    }
    const selectiveMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
      ...selectiveHistory.map(h => ({ role: h.role, content: `${h.content}\n（话题:${h.topic}）` })),
      { role: "user", content: `${userText}\n\n当前问题:${query}` },
    ];
    const selectiveBudget = encode(selectiveMessages.map(m => `${m.role}: ${m.content}`).join("\n")).length;
    let selectiveReply = "";
    try {
      const out = await callLlmOnce(selectiveMessages, modelA, "selective");
      selectiveReply = out.reply;
    } catch (err: unknown) {
      ctx.status = 502;
      ctx.body = { error: "upstream_failed", stage: "selective", message: (err as Error).message };
      return;
    }

    const fullReplyTokens = encode(fullReply).length;
    const selectiveReplyTokens = encode(selectiveReply).length;
    const body = {
      config: { query, keywords, kwList, selectN, userText, modelA },
      full: {
        messages: fullMessages,
        reply: fullReply,
        replyTokens: fullReplyTokens,
        inputTokens: fullBudget,
        segmentCount: history.length,
      },
      selective: {
        messages: selectiveMessages,
        reply: selectiveReply,
        replyTokens: selectiveReplyTokens,
        inputTokens: selectiveBudget,
        segmentCount: selectiveHistory.length,
        pickedSegments: picked.map(p => ({ topic: p.topic, turnIndex: p.turnIndex, score: p.score, userHits: p.userHits, assistantHits: p.assistantHits })),
      },
      topicGroups,
      触发说明: `query 关键词(${kwList.join(" / ")})在 ${history.length} 段多话题 history 中命中 ${picked.length} 段 → 只把这 ${picked.length} 段塞进 messages,其他 ${history.length - pickedHistory(picked, history)} 段不进 messages。`,
    };

    logger.info("selective.handler", "调用函数结束：selective", "为什么写这条日志：要把完整出参写到日志;学习者翻日志能复盘「全塞 vs 选择性」的 token 差。", {
      返回值: { fullInputTokens: fullBudget, selectiveInputTokens: selectiveBudget, fullReplyTokens, selectiveReplyTokens, saved: fullBudget - selectiveBudget },
      字段释义: {
        "fullInputTokens": "全塞路径的输入 token(50 段 history + system + query)",
        "selectiveInputTokens": "选择性路径的输入 token(只 picked 段 + system + query)",
        "fullReplyTokens / selectiveReplyTokens": "两条路径的输出 token",
        "saved": "选择性 vs 全塞 省下的输入 token",
      },
      耗时ms: Date.now() - tHandler0,
    });

    ctx.body = body;
  });
}

// 辅助:算被丢的段数
function pickedHistory(picked: Array<{ topic: string; turnIndex: number }>, all: Array<{ topic: string; turnIndex: number }>): number {
  const pickedSet = new Set(picked.map(p => `${p.topic}-${p.turnIndex}`));
  return all.filter(h => !pickedSet.has(`${h.topic}-${h.turnIndex}`)).length;
}
