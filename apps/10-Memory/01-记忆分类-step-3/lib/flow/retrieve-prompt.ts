/**
 * 本步核心：检索 / 按相关性召回（拼 Prompt 那一段）—— 把 Top-K 拼成 system + user 两条 messages。
 *
 * 职责（按调用顺序）：
 *   1. SYSTEM_PROMPT：提示词告诉模型「只能基于筛出的事实回答，别瞎编」
 *   2. composeMessages：把 Top-K 拼进 system + user 两条 messages（Top-K 为空时给明确提示）
 *   3. stripWrap：推理模型可能在正文前带 <think> 块，先剥掉再 parse
 *   4. AskOutputSchema：模型返回内容的最小校验（必须有 answer 字符串）
 *
 * 为什么单独成文件：纯字符串拼装 + 不依赖 LLM；让主流程文件（retrieve-and-compose.ts）保持「调 LLM + 串流程」一种职责。
 */
import { z } from "zod";
import type { ScoredFact } from "./retrieve-score.js";

/** 系统提示词：告诉模型「只能基于召回的事实回答，别瞎编」。{RETRIEVED_FACTS} 是占位符，运行时替换。 */
export const SYSTEM_PROMPT = `你是一个「基于长期记忆回答问题」的助手。给你的 user 消息里有一句用户的提问，下面是按相关性从该用户的长期事实库里筛出的若干条事实。

回答规则：
1. 只能从筛出来的事实里找答案；筛出来的事实里没有的，直接说「我的长期记忆里没有这条信息」。
2. 不要编造筛出来的事实里没写的内容。
3. 回答完提问后，简短列出你引用了哪几条事实（按出现顺序）。

筛出的事实：
{RETRIEVED_FACTS}`;

/** 把 Top-K 拼进 system + user 两条 messages。Top-K 为空时给一段明确提示，避免模型瞎编。 */
export function composeMessages(
  query: string,
  topK: ScoredFact[],
): Array<{ role: "system" | "user"; content: string }> {
  const factsBlock =
    topK.length === 0
      ? "（该用户的长期事实库里没有任何一条与这个问题相关的内容）"
      : topK
          .map((s, i) => {
            return `[${i + 1}] 类型=${s.fact.memoryType} / 期限=${s.fact.term} / 余弦相似度=${s.score.toFixed(4)}
原话：${s.fact.sentence}
理由：${s.fact.reason}`;
          })
          .join("\n\n");
  const systemContent = SYSTEM_PROMPT.replace("{RETRIEVED_FACTS}", factsBlock);
  const userContent = `问题：${query}`;
  return [
    { role: "system" as const, content: systemContent },
    { role: "user" as const, content: userContent },
  ];
}

/** 模型返回内容的最小校验：必须有 answer 字段（不强求 JSON，纯文本作答时整段当作 answer）。 */
export const AskOutputSchema = z.object({
  answer: z.string(),
});

/** 推理模型（MiniMax-M3 之类）即便没开 JSON Mode，有时也会在正文前带一段 <think>...</think>。先剥掉再 parse。 */
export function stripWrap(raw: string): string {
  let s = raw.trim();
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return s;
}