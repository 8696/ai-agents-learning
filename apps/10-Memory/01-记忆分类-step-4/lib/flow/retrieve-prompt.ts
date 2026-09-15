/**
 * 职责：把三类记忆拼成这一次请求的 system 段（不调模型、不做嵌入）。
 *
 * 本步核心：行业拆法（MemGPT / Letta 的核心记忆 vs 档案记忆；ChatGPT 已保存记忆「之后每次都会考虑」）：
 *   - 程序性记忆、核心用户画像（语义记忆·长期）→ 常驻，每轮整份带上，不按问句筛
 *   - 情景记忆 → 按当前问句检索，只活在这一次请求里，下一问整块替换
 *   - 对话历史不进本文件，由主流程接到 user / assistant 轮次
 *
 * 数据流：程序性规则文本 + 核心画像条目 + 本轮情景 Top-K → 一段 system 字符串。
 */
import type { PersistedFact } from "../storage/facts-store.js";
import type { ScoredFact } from "./retrieve-score.js";

export function formatProgramBlock(rulesText: string): string {
  return rulesText.trim() ? rulesText.trim() : "（当前没有任何全员规则）";
}

export function formatCoreProfileBlock(facts: PersistedFact[]): string {
  if (facts.length === 0) {
    return "（当前没有核心用户画像。问技术栈 / 姓名 / 城市时，模型看不到跨会话事实。）";
  }
  return facts
    .map((f, i) => {
      return `[画像 ${i + 1}] key=${f.key}
原话：${f.sentence}
理由：${f.reason}`;
    })
    .join("\n\n");
}

export function formatEpisodicBlock(args: {
  skipped: boolean;
  skipReason: string;
  topK: ScoredFact[];
}): string {
  if (args.skipped) {
    return `（本轮跳过情景召回：${args.skipReason}。核心用户画像仍在上面那一块。）`;
  }
  if (args.topK.length === 0) {
    return "（这一问没有检索到足够相关的经历。不等于用户从没做过类似的事，只是这一问没召回。）";
  }
  return args.topK
    .map((s, i) => {
      return `[经历 ${i + 1}] 余弦相似度=${s.score.toFixed(4)}
原话：${s.fact.sentence}
理由：${s.fact.reason}`;
    })
    .join("\n\n");
}

/**
 * 闲聊 / 纯算术 / 「刚才说了什么」不值得跑一遍嵌入去翻经历。
 * 核心用户画像仍然常驻；这里只决定要不要检索情景。
 */
export function shouldSearchEpisodes(query: string): { search: boolean; reason: string } {
  const q = query.trim();
  if (!q) return { search: false, reason: "问句是空的" };
  if (/^(你好|嗨|哈喽|hello|hi)[！!。.\s]*$/i.test(q)) {
    return { search: false, reason: "问候 / 闲聊，不需要翻历史经历" };
  }
  if (/刚才|上一句|你说了什么|记下了吗/.test(q)) {
    return { search: false, reason: "问的是本轮对话，看工作记忆（messages 历史）即可" };
  }
  if (/\d/.test(q) && /(等于多少|乘以|[×x*＋+\-]\s*\d+)/.test(q)) {
    return { search: false, reason: "纯算术，翻经历帮不上忙" };
  }
  return { search: true, reason: "这一问可能用得上相似经历" };
}

export function composeSystemContent(args: {
  programBlock: string;
  coreFacts: PersistedFact[];
  episodicSkipped: boolean;
  episodicSkipReason: string;
  episodicTopK: ScoredFact[];
}): string {
  const program = formatProgramBlock(args.programBlock);
  const core = formatCoreProfileBlock(args.coreFacts);
  const episodes = formatEpisodicBlock({
    skipped: args.episodicSkipped,
    skipReason: args.episodicSkipReason,
    topK: args.episodicTopK,
  });
  return `你是公司内部前端代码助手。system 段分三块，来源和生命周期不一样：

【程序性记忆 / 全员规则】（每次都带，不按问句更换）
${program}

【核心用户画像 / 语义记忆】（每次都带，不按问句筛。问 B 时不会丢掉问 A 用过的画像。）
${core}

【本轮相关经历 / 情景记忆】（按当前问句检索，只活在这一次请求；下一问整块替换，不追加进对话历史。）
${episodes}

【行为约定】
- 全员规则约束你怎么回答（先结论再代码、组件写法、危险操作先确认）。
- 核心用户画像是关于这个用户的持续事实，每一问都要考虑；用户没再提技术栈，也按画像里的技术栈写。
- 本轮相关经历只是这一问的补充线索。
- 本轮对话在后面的 user / assistant 消息里。用户问「刚才说了什么」，看对话历史，不要假装没看见。
- 可以闲聊、做算术、写代码。不要假装只能根据记忆库里的字回答。
- 用户问起画像里没有的个人信息，直说长期记忆里没有这条。`;
}
