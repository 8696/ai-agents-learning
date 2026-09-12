/**
 * 职责：用成熟库 wink-bm25-text-search 建内存索引、按问句搜 Top-K。
 *       切词故意复用本条手写 tokenize（keep-dash），避免「两边结论不同只因切词不同」。
 *
 * 数据流：CORPUS → addDoc → consolidate → search(query) → [{cardId, score, rank}]
 *
 * 为什么单独成文件：和手写 bm25.ts 对称；对照时一眼看出「库侧入口」。
 */
// wink 是 CommonJS，无官方 TS 类型
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error wink-bm25-text-search 无 types
import winkBm25Factory from "wink-bm25-text-search";
import { CORPUS, type KnowledgeCard } from "./knowledge-base.js";
import { tokenize } from "./bm25.js";

export type WinkRow = {
  cardId: string;
  text: string;
  score: number;
  rank: number;
};

type WinkEngine = {
  defineConfig: (cfg: {
    fldWeights: Record<string, number>;
    bm25Params?: { k1?: number; b?: number; k?: number };
  }) => void;
  definePrepTasks: (tasks: Array<(text: string) => string[]>) => void;
  addDoc: (doc: Record<string, string>, uid: string | number) => void;
  consolidate: () => void;
  search: (text: string, limit?: number) => Array<[string | number, number]>;
  reset: () => void;
};

let engineCache: WinkEngine | null = null;
let cardById: Map<string, KnowledgeCard> | null = null;
/** 语料换了必须重建索引；用 CORPUS 长度 + 首卡 id 当粗指纹 */
let corpusFingerprint: string | null = null;

function currentFingerprint(): string {
  return `${CORPUS.length}:${CORPUS[0]?.id ?? ""}:${CORPUS[CORPUS.length - 1]?.id ?? ""}`;
}

/** 懒建索引：进程内建一次；语料指纹变了则重建 */
function ensureEngine(): WinkEngine {
  const fp = currentFingerprint();
  if (engineCache && corpusFingerprint === fp) return engineCache;
  engineCache = null;
  cardById = null;
  corpusFingerprint = fp;
  const engine = winkBm25Factory() as WinkEngine;
  // k1/b 与手写教学默认对齐（手写 k1=1.5,b=0.75）；分数绝对值仍可能不同（IDF 细节），比的是排名结论
  engine.defineConfig({
    fldWeights: { text: 1 },
    bm25Params: { k1: 1.5, b: 0.75, k: 1 },
  });
  engine.definePrepTasks([(text: string) => tokenize(text, "keep-dash")]);
  for (const card of CORPUS) {
    engine.addDoc({ text: card.text }, card.id);
  }
  engine.consolidate();
  engineCache = engine;
  cardById = new Map(CORPUS.map((c) => [c.id, c]));
  return engine;
}

/**
 * 库侧搜索：返回与手写侧同形状的行（cardId / text / score / rank）
 */
export function searchByWink(query: string, topK: number): {
  query: string;
  library: "wink-bm25-text-search";
  rows: WinkRow[];
} {
  const engine = ensureEngine();
  // search 只回 [uid, score]；切词在 definePrepTasks 里注入，但不由本函数对外冒充「库返回」
  const hits = engine.search(query, Math.max(topK, CORPUS.length));
  const rows: WinkRow[] = hits.map(([uid, score], idx) => {
    const cardId = String(uid);
    const card = cardById!.get(cardId);
    return {
      cardId,
      text: card?.text ?? "",
      score,
      rank: idx + 1,
    };
  }).slice(0, topK);
  return {
    query,
    library: "wink-bm25-text-search",
    rows,
  };
}
