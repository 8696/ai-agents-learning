/**
 * 职责：内置本 step 的「退款政策 v2」语料（9 月 1 日改成三天）。
 * 数据流：lib/rag/search.ts 读 → toy 向量化 → 余弦打分。
 *
 * 为什么内置：避免本 step 引入文件读取（模块 06 已经做过），把教学点收在「选型对照」上。
 *   替换为本 demo 之外的真实语料 = 拆出语料维护这件事，违背「本条只验证当前这一步」。
 */
export type CorpusChunk = {
  /** 切块 id，全语料内唯一 */
  chunkId: string;
  /** 文件名（人话，UI 显示用） */
  source: string;
  /** 章节/小节名（人话） */
  section: string;
  /** 原文 */
  text: string;
};

export const CORPUS: CorpusChunk[] = [
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