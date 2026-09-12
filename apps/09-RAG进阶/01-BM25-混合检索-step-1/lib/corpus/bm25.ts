/**
 * 职责：BM25 关键词打分 + 简单中文切词（按空白/标点 + 保留连字符/点号）。
 *       教学版：k1=1.5, b=0.75；不算文档长度也行，本 demo 卡都短，长度归一影响很小。
 *
 * 为什么这样切：
 *   - 英文空格天然词边界；中文按字符切会把 `SKU-8821` 撕碎；
 *   - 本 demo 只演示「编号能不能被对上」，所以保留连字符 / 点号作为词的延续；
 *   - 中文连续字不做分词库切（jieba 等要预装依赖，教学上不必要）。
 *
 * 数据流：query → tokenize → 对每张卡算 BM25 → 排序 → Top-K
 */
import type { KnowledgeCard } from "./knowledge-base.js";

/** 教学版 BM25 参数（经典默认） */
const K1 = 1.5;
const B = 0.75;

/**
 * 切词：保留连字符 / 点号 / 字母 + 数字混合（如 SKU-8821 / ERR-4401 / v1.2.3）。
 * 中文按单字切（教学上够用：本 demo 主要考「稀有词」是否被对上）。
 * 英文 / 数字按空白 / 标点切。
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  // 先把空格、中文标点、全角符号切成切
  // 保留：字母 / 数字 / 连字符 - / 点 .  / 下划线 _
  const parts = text.split(/[\s　、。，！？《》（）：；]+/);
  for (const part of parts) {
    if (!part) continue;
    // 一个 part 里可能有「中文连续」+「英文片段」混在一起，需要再细分
    // 这里做粗切：连续中文字符按单字切；连续 [A-Za-z0-9._-] 整段保留
    const subParts = part.match(/[A-Za-z0-9._-]+|[一-龥]/g) ?? [];
    for (const sp of subParts) {
      if (sp) tokens.push(sp);
    }
  }
  return tokens;
}

/** 文档频率（df）：某个词出现在多少张卡 */
function docFreq(cards: KnowledgeCard[], term: string): number {
  let n = 0;
  for (const card of cards) {
    if (tokenize(card.text).includes(term)) n += 1;
  }
  return n;
}

export type Bm25Row = {
  card: KnowledgeCard;
  /** BM25 原始分（越大越相关） */
  score: number;
  rank: number;
  /** 这张卡里出现了哪些 query 词（高频回显用） */
  matchedTerms: string[];
};

/**
 * 给定问句，对每张卡打 BM25；按 score 降序；赋 rank。
 * 不裁 Top-K，由调用方决定要不要裁。
 */
export function bm25Score(query: string, cards: KnowledgeCard[]): {
  query: string;
  tokens: string[];
  rows: Bm25Row[];
} {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return { query, tokens: [], rows: cards.map((card, idx) => ({ card, score: 0, rank: idx + 1, matchedTerms: [] })) };
  }
  const N = cards.length;
  const idf = new Map<string, number>();
  for (const term of queryTokens) {
    const df = docFreq(cards, term);
    // IDF = ln((N - df + 0.5) / (df + 0.5) + 1)  —— 加 1 防负（经典 BM25+ 写法）
    idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }

  const rows = cards.map<Bm25Row>((card) => {
    const docTokens = tokenize(card.text);
    const docLen = docTokens.length;
    const tf = new Map<string, number>();
    for (const t of docTokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const matched = new Set<string>();
    let score = 0;
    for (const term of queryTokens) {
      const f = tf.get(term) ?? 0;
      if (f > 0) matched.add(term);
      const idfVal = idf.get(term) ?? 0;
      // 文档长度归一：avgDl 在本 demo 6 条卡都很短，差异小，所以 (1 - b + b * dl/avgDl) 接近 1
      const numerator = f * (K1 + 1);
      const denominator = f + K1 * (1 - B + B * (docLen / Math.max(1, docLen)));
      score += idfVal * (numerator / denominator);
    }
    return {
      card,
      score,
      rank: 0,
      matchedTerms: [...matched],
    };
  });

  rows.sort((a, b) => b.score - a.score);
  rows.forEach((row, idx) => {
    row.rank = idx + 1;
  });

  return { query, tokens: queryTokens, rows };
}