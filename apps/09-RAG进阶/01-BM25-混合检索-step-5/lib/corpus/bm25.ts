/**
 * 职责：BM25 关键词打分 + 三档切词模式（变体 8：按整词保留 / 撕成单字 / 按语义切）。
 *       教学版：k1=1.5, b=0.75；本 demo 切块都短，文档长度归一影响很小。
 *
 * 三档切词模式（同一问句、同一 CORPUS、同一 BM25 公式，只换切词 → 排名会变）：
 *   - `keep-dash`（按整词保留）：英文 / 数字 / 连字符 / 点号作为整段（如 `SKU-8821` 一个 token）；
 *     中文按单字切（教学极端对照用）。
 *   - `split-chars`（撕成单字）：英文 / 数字 / 连字符 / 中文都按单字切
 *     （如 `SKU-8821` → 8 个单字、`保修` → `保`、`修`）。
 *   - `jieba`（按语义切）：用 nodejieba 切中文（如「保修」「几年」一个词），
 *     英文 / 数字 / 连字符作为整段。这一档是真实生产 BM25 中文场景的标准做法。
 *
 * 数据流：query + mode → tokenize → 对每个切块算 BM25 → 排序 → Top-K
 */
import type { KnowledgeCard } from "./knowledge-base.js";
// nodejieba 是 CJS 原生模块（d.ts 写的 ESM 风格是声明与运行时不一致）。
// ESM 下用 default import 拿整个模块对象，再走 jieba.cut。
import jieba from "nodejieba";

export type TokenizeMode = "keep-dash" | "split-chars" | "jieba";

/** 教学版 BM25 参数（经典默认） */
const K1 = 1.5;
const B = 0.75;

/** 仅匹配空白与中文标点的分隔符（jieba 模式不用它——jieba 自己处理空白与标点） */
const WHITESPACE_AND_CJK_PUNCT = /[\s　、。，！？《》（）：；]+/;
/** keep-dash 不拆连字符 / 点号；split-chars 连字符 / 点号 / 下划线都拆 */
const WHITESPACE_AND_PUNCT_SPLIT_DASH = /[\s　、。，！？《》（）：；\-._]+/;

/**
 * 切词。
 *
 * - mode="keep-dash"：英文 / 数字 / 连字符 / 点号作为整段；中文按单字。
 * - mode="split-chars"：所有字符按单字切（包括 `SKU-8821` → 8 个单字、中文每个字一个 token）。
 * - mode="jieba"：整段交给 nodejieba 切——中文按语义词（如「保修」「几年」一个词），
 *   英文 / 数字 / 连字符作为整段保留；过滤掉纯空白 / 纯中文标点的 token。
 */
export function tokenize(text: string, mode: TokenizeMode = "keep-dash"): string[] {
  if (mode === "jieba") {
    // jieba 默认会把英文/数字按字符切（不是按词），所以：
    //   ① 先用正则把英文 / 数字 / 连字符 / 点号 / 下划线作为整段抽出来
    //   ② 中文段交给 jieba 按语义词切（如「保修」「几年」）
    //   ③ 合并；过滤掉纯空白 / 纯中文标点
    const engTokens = text.match(/[A-Za-z0-9._-]+/g) ?? [];
    const cnOnly = text.replace(/[A-Za-z0-9._-]+/g, " ");
    const jiebaTokens: string[] = jieba.cut(cnOnly, false);
    const cnFiltered = jiebaTokens.filter((tk) => {
      if (!tk) return false;
      return !/^[\s　、。，！？《》（）：；]+$/.test(tk);
    });
    return [...engTokens, ...cnFiltered];
  }

  const tokens: string[] = [];
  const splitRegex =
    mode === "split-chars" ? WHITESPACE_AND_PUNCT_SPLIT_DASH : WHITESPACE_AND_CJK_PUNCT;
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

/** 文档频率（df）：某个词出现在多少个切块（按当前 mode 切——这样三档切词的 IDF 各自正确） */
function docFreq(cards: KnowledgeCard[], term: string, mode: TokenizeMode): number {
  let n = 0;
  for (const card of cards) {
    if (tokenize(card.text, mode).includes(term)) n += 1;
  }
  return n;
}

export type Bm25Row = {
  card: KnowledgeCard;
  /** BM25 原始分（越大越相关） */
  score: number;
  rank: number;
  /** 这个切块里出现了哪些 query 词（高频回显用） */
  matchedTerms: string[];
};

export type Bm25ScoreOptions = {
  /** 切词模式（默认 keep-dash） */
  mode?: TokenizeMode;
};

/**
 * 给定问句，对每个切块打 BM25；按 score 降序；赋 rank。
 * 不裁 Top-K，由调用方决定要不要裁。
 *
 * mode 决定 tokenize 行为；df 仍按默认 keep-dash 算（教学版简化——本 demo 切块都很短，
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
    const df = docFreq(cards, term, mode);
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
      // 文档长度归一：avgDl 在本 demo 6 个切块都很短，差异小，所以 (1 - b + b * dl/avgDl) 接近 1
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