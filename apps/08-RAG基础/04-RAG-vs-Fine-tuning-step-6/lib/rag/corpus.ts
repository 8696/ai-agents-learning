/**
 * 职责：内置本 step 的语料（含「可改公告」机制 —— 给需求 5「混合」演示用）。
 * 数据流：
 *   - 检索时：lib/flow/answer-with-rag.ts 读 → search 返回 hits → 拼 system
 *   - 改公告时：routes/corpus-edit.ts 调 addAnnouncement() → 内存里改 refund-v2-001 的 text
 *
 * 为什么支持「可改公告」：演示「事实跟着材料变」—— 改 .md 文件重入库是真实生产动作；
 *   本步把这一步暴露成按钮，让「改公告 → 答案跟着变」可点可观察。
 */
export type CorpusChunk = {
  chunkId: string;
  source: string;
  section: string;
  text: string;
};

const INITIAL_CORPUS: CorpusChunk[] = [
  {
    chunkId: "refund-v2-001",
    source: "refund-v2.md",
    section: "退货总则",
    text: "本政策自 2026 年 9 月 1 日起施行。无理由退货期限由原 7 天调整为 3 天（自签收日起算，含法定节假日）。",
  },
  {
    chunkId: "refund-v2-002",
    source: "refund-v2.md",
    section: "运费承担",
    text: "买家无理由退货的，运费由买家承担。商品质量问题的退货，运费由卖家承担。",
  },
  {
    chunkId: "refund-v2-003",
    source: "refund-v2.md",
    section: "退款时效",
    text: "卖家收到退货商品后 3 个工作日内退款。原路返回至买家付款账户。",
  },
  {
    chunkId: "refund-v2-004",
    source: "refund-v2.md",
    section: "客服口吻",
    text: "售后客服统一口吻：先道歉、再结论、再依据。不允许使用「亲」「绝对」「包您满意」等夸张表达。",
  },
];

// 内存里的 corpus —— 服务进程内可变；重启清回 INITIAL_CORPUS。
let corpus: CorpusChunk[] = INITIAL_CORPUS.map(c => ({ ...c }));

export function getCorpus(): CorpusChunk[] {
  return corpus;
}

/**
 把「refund-v2-001」的 text 改成「调整为 N 天」 —— 演示「改公告后事实跟着变」。
 N 默认 7（让答案从「3 天」变回「7 天」）。
 */
export function addAnnouncement(days: number): { before: string; after: string } {
  const before = corpus.find(c => c.chunkId === "refund-v2-001")?.text ?? "";
  const after = `本政策自 2026 年 9 月 1 日起施行。无理由退货期限由原 7 天调整为 ${days} 天（自签收日起算，含法定节假日）。`;
  corpus = corpus.map(c =>
    c.chunkId === "refund-v2-001" ? { ...c, text: after } : c,
  );
  return { before, after };
}

export function resetAnnouncement(): { before: string; after: string } {
  const before = corpus.find(c => c.chunkId === "refund-v2-001")?.text ?? "";
  const original = INITIAL_CORPUS.find(c => c.chunkId === "refund-v2-001")?.text ?? "";
  corpus = corpus.map(c =>
    c.chunkId === "refund-v2-001" ? { ...c, text: original } : c,
  );
  return { before, after: original };
}