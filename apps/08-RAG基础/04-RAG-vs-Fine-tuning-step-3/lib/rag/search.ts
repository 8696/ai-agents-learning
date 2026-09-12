/**
 * 职责：toy 检索 —— 词袋 + 余弦。给一段问题，按余弦相关度从语料里挑 Top-K 切块。
 * 数据流：lib/flow/answer-with-rag.ts 调 → 排序 → 返回 topK。
 *
 * 本步核心 1（answer-with-rag.ts）就是这一步 + 拼提示词 + 调模型；这一步是「检索」那一跳。
 * 「真嵌入模型」留给模块 01-06 / 模块 08-01 那一类 step —— 本条只验证选型对照，不复述嵌入。
 */
import { CORPUS, CorpusChunk } from "./corpus.js";

export type Hit = {
  chunkId: string;
  source: string;
  section: string;
  /** 余弦相关度，0~1，已保留三位小数 */
  score: number;
  /** 命中切块的前 60 字（中文按字符算，英文按词算），用于 UI 预览 */
  preview: string;
};

// ── 极简分词：英文按词切；中文按字符切；扔掉高频无意义字 ──
const cnStop = new Set([
  "的", "了", "是", "吗", "还", "能", "不", "在", "我", "你", "他", "她", "它",
  "要", "有", "就", "也", "都", "和", "或", "但", "把", "被", "让", "从", "上",
  "下", "里", "为", "对", "到", "以", "这", "那", "么", "一", "个",
]);

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const en = text.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const w of en) if (w.length > 1) tokens.push(w);
  const zh = text.match(/[一-龥]/g) ?? [];
  for (const c of zh) if (!cnStop.has(c)) tokens.push(c);
  return tokens;
}

// ── 词袋向量：稀疏表示，键 = 词表下标 ──
function vectorize(tokens: string[], vocab: Map<string, number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const t of tokens) {
    const idx = vocab.get(t);
    if (idx === undefined) continue;
    out.set(idx, (out.get(idx) ?? 0) + 1);
  }
  return out;
}

function cosine(a: Map<number, number>, b: Map<number, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const [, v] of a) na += v * v;
  for (const [, v] of b) nb += v * v;
  for (const [k, v] of a) {
    const bv = b.get(k);
    if (bv !== undefined) dot += v * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function preview(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > 60 ? trimmed.slice(0, 60) + "…" : trimmed;
}

// ── 一次性建索引（词表 + 每条切块的向量）──
const VOCAB = new Map<string, number>();
const VECTORS: Map<number, number>[] = [];
for (const chunk of CORPUS) {
  const toks = tokenize(chunk.text + " " + chunk.section);
  for (const t of toks) {
    if (!VOCAB.has(t)) VOCAB.set(t, VOCAB.size);
  }
  VECTORS.push(vectorize(toks, VOCAB));
}

/**
 * 检索：返回按余弦相关度排序的前 K 条命中。
 * 同分时按语料顺序排（命中 0 分的也返回 —— 让 UI 看见「检索不到」也能是 0 分，不是抛错）。
 */
export function search(query: string, topK: number = 3): Hit[] {
  const qVec = vectorize(tokenize(query), VOCAB);
  const scored = CORPUS.map((chunk: CorpusChunk, i: number) => ({
    chunk,
    score: cosine(qVec, VECTORS[i]),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return 0; // 保持原顺序即可
  });
  return scored.slice(0, topK).map(({ chunk, score }) => ({
    chunkId: chunk.chunkId,
    source: chunk.source,
    section: chunk.section,
    score: Number(score.toFixed(3)),
    preview: preview(chunk.text),
  }));
}