/**
 * 职责：BM25 关键词打分 + 切词模式（变体 8：保留连字符 vs 撕单字）。
 *       教学版：k1=1.5, b=0.75；不算文档长度也行，本 demo 卡都短，长度归一影响很小。
 *
 * 为什么这样切：
 *   - 英文空格天然词边界；中文按字符切会把 `SKU-8821` 撕碎；
 *   - 本 demo 只演示「编号能不能被对上」，所以保留连字符 / 点号作为词的延续；
 *   - 中文连续字不做分词库切（jieba 等要预装依赖，教学上不必要）。
 *
 * 切词模式：
 *   - `keep-dash`（默认）：保留连字符 / 点号作为词的延续（如 `SKU-8821` 整体一个 token）
 *   - `split-chars`：连字符 / 点号都拆成单字符（如 `SKU-8821` → `S,K,U,-,8,8,2,1`，编号被撕碎）
 *
 * 数据流：query + mode → tokenize → 对每张卡算 BM25 → 排序 → Top-K
 */
import type { KnowledgeCard } from "./knowledge-base.js";

export type TokenizeMode = "keep-dash" | "split-chars";

/** 教学版 BM25 参数（经典默认） */
const K1 = 1.5;
const B = 0.75;

/**
 * 切词：
 *   - mode="keep-dash"：保留连字符 / 点号 / 字母数字混合（如 SKU-8821 / ERR-4401 / v1.2.3）。
 *     中文按单字切。英文 / 数字按空白 / 标点切。
 *   - mode="split-chars"：把连字符 / 点号 / 下划线也单独拆出来（如 `SKU-8821` → `S,K,U,-,8,8,2,1`）。
 */
export function tokenize(text: string, mode: TokenizeMode = "keep-dash"): string[] {
  const tokens: string[] = [];
  const splitRegex = mode === "split-chars"
    ? /[\s　、。，！？《》（）：；\-._]+/
    : /[\s　、。，！？《》（）：；]+/;
  const parts = text.split(splitRegex);
  for (const part of parts) {
    if (!part) continue;
    if (mode === "split-chars") {
      // 单字符切：每个字符单独
      for (const ch of part) {
        if (ch.trim().length > 0) tokens.push(ch);
      }
    } else {
      // 默认：连续 [A-Za-z0-9._-] 整段保留 / 中文按单字
      const subParts = part.match(/[A-Za-z0-9._-]+|[一-龥]/g) ?? [];
      for (const sp of subParts) {
        if (sp) tokens.push(sp);
      }
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
  /** BM25 原始分（越大越相关） */
  score: number;
  rank: number;
  /** 这张卡里出现了哪些 query 词（高频回显用） */
  matchedTerms: string[];
};

export type Bm25ScoreOptions = {
  /** 切词模式（默认 keep-dash） */
  mode?: TokenizeMode;
};

/**
 * 给定问句，对每张卡打 BM25；按 score 降序；赋 rank。
 * 不裁 Top-K，由调用方决定要不要裁。
 *
 * mode 决定 tokenize 行为；df 仍按默认 keep-dash 算（教学版简化——本 demo 卡都很短，
 * df 按 split-chars 算会把所有单字 df=1，不具区分意义）。
 */
export function bm25Score(
  query: string,
  cards: KnowledgeCard[],
  options: Bm25ScoreOptions = {},
): {
  query: string;
  tokens: string[];
  mode: TokenizeMode;
  rows: Bm25Row[];
} {
  const mode = options.mode ?? "keep-dash";
  const queryTokens = tokenize(query, mode);
  if (queryTokens.length === 0) {
    return { query, tokens: [], mode, rows: cards.map((card, idx) => ({ card, score: 0, rank: idx + 1, matchedTerms: [] })) };
  }
  const N = cards.length;
  const idf = new Map<string, number>();
  for (const term of queryTokens) {
    const df = docFreq(cards, term);
    // IDF = ln((N - df + 0.5) / (df + 0.5) + 1)  —— 加 1 防负（经典 BM25+ 写法）
    idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }

  const rows = cards.map<Bm25Row>((card) => {
    const docTokens = tokenize(card.text, mode);
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

  return { query, tokens: queryTokens, mode, rows };
}