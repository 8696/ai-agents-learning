/**
 * 职责：toy 检索 —— 词袋 + 余弦。给一段问题，按余弦相关度从语料里挑 Top-K 切块。
 * 数据流：lib/flow/answer-with-rag.ts 调 → 排序 → 返回 topK。
 *
 * 注：本 step 的 corpus 可变（lib/rag/corpus.ts 的 addAnnouncement / resetAnnouncement），
 *   索引在每次 search 调用时基于当前 corpus 重建 —— 改公告后检索立刻跟着变。
 */
import { getCorpus, CorpusChunk } from "./corpus.js";

export type Hit = {
  chunkId: string;
  source: string;
  section: string;
  score: number;
  preview: string;
};

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

/** 检索：返回按余弦相关度排序的前 K 条命中（基于当前 corpus 实时建索引）。 */
export function search(query: string, topK: number = 3): Hit[] {
  const corpus = getCorpus();
  const VOCAB = new Map<string, number>();
  const VECTORS: Map<number, number>[] = [];
  for (const chunk of corpus) {
    const toks = tokenize(chunk.text + " " + chunk.section);
    for (const t of toks) {
      if (!VOCAB.has(t)) VOCAB.set(t, VOCAB.size);
    }
    VECTORS.push(vectorize(toks, VOCAB));
  }
  const qVec = vectorize(tokenize(query), VOCAB);
  const scored = corpus.map((chunk: CorpusChunk, i: number) => ({
    chunk,
    score: cosine(qVec, VECTORS[i]),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return 0;
  });
  return scored.slice(0, topK).map(({ chunk, score }) => ({
    chunkId: chunk.chunkId,
    source: chunk.source,
    section: chunk.section,
    score: Number(score.toFixed(3)),
    preview: preview(chunk.text),
  }));
}