/**
 * 职责：BM25 关键词打分 + 切词。
 *
 * 数据流：query + mode → tokenize → 对每张卡算 BM25 → 排序 → Top-K
 *
 * 切词模式：
 *   - `keep-dash`（默认）：保留连字符 / 点号作为词的延续（如 `SKU-8821` 整体一个 token）
 */
import type { KnowledgeCard } from "./knowledge-base.js";

export type TokenizeMode = "keep-dash";

/** 教学版 BM25 参数（经典默认） */
const K1 = 1.5;
const B = 0.75;

/**
 * 切词：保留连字符 / 点号 / 字母数字混合（如 SKU-8821 / ERR-4401），
 * 中文按单字切。英文 / 数字按空白 / 标点切。
 */
export function tokenize(text: string, mode: TokenizeMode = "keep-dash"): string[] {
  const tokens: string[] = [];
  const splitRegex = /[\s　、。，！？《》（）：；]+/;
  const parts = text.split(splitRegex);
  for (const part of parts) {
    if (!part) continue;
    const subParts = part.match(/[A-Za-z0-9._-]+|[一-龥]/g) ?? [];
    for (const sp of subParts) {
      if (sp) tokens.push(sp);
    }
  }
  return tokens;
}

/** 文档频率（df）：某个词出现在多少张卡（基于默认 tokenize） */
function docFreq(cards: KnowledgeCard[], term: string): number {
  let n = 0;
  for (const card of cards) {
    if (tokenize(card.text).includes(term)) n += 1;
  }
  return n;
}

export type Bm25Row = {
  card: KnowledgeCard;
  score: number;
  rank: number;
  matchedTerms: string[];
};

/**
 * 给定问句，对每张卡打 BM25；按 score 降序；赋 rank。
 * 不裁 Top-K，由调用方决定要不要裁。
 */
export function bm25Score(
  query: string,
  cards: KnowledgeCard[],
): {
  query: string;
  tokens: string[];
  rows: Bm25Row[];
} {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return { query, tokens: [], rows: cards.map((card, idx) => ({ card, score: 0, rank: idx + 1, matchedTerms: [] })) };
  }
  const N = cards.length;
  const avgDl = cards.reduce((sum, c) => sum + tokenize(c.text).length, 0) / Math.max(1, N);
  const idf = new Map<string, number>();
  for (const term of queryTokens) {
    const df = docFreq(cards, term);
    // IDF = ln((N - df + 0.5) / (df + 0.5) + 1) —— 加 1 防负（经典 BM25+ 写法）
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
      const numerator = f * (K1 + 1);
      const denominator = f + K1 * (1 - B + B * (docLen / Math.max(1, avgDl)));
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