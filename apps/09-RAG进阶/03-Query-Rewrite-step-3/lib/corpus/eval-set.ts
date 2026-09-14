/**
 * 职责：评测集（变体 11）—— ~30 题人工标注，每题写明期望命中的切块 id。
 * 数据流：evaluate 时按题跑 retrieveByQueryUsed 或 rewriteAndRetrieve，对照期望命中。
 *
 * targetIds 多 id：手册可能一条政策跨多个切块（如「退货几天、保修几年」）。
 * 命中规则：top-K 含 targetIds 任一即算命中。
 *
 * 注意：本步只切"改写开 / 关"一个变量，其他开关不动（笔记反复强调的「一次只加一个变量」）。
 */
import { CHUNKS, type Chunk } from "./chunks.js";

export type EvalCategory =
  | "日常说法"
  | "短问句"
  | "货号"
  | "条款号"
  | "库标题照搬"
  | "子问题"
  | "残句指代"
  | "其他";

export type EvalQuestion = {
  id: string;
  query: string;
  /** 期望命中的切块 id（任一命中即算命中 —— top-K 含任一即 hit=true） */
  targetIds: string[];
  /** 题目分类（用于页面分组展示 + 归因哪类问题改写提升最大） */
  category: EvalCategory;
};

/**
 * 30 题评测集。覆盖 8 个切块 + 多种问法。
 * 选题原则：
 *  - 每类题至少 3 题，方便归因「改写对哪类题提升最大」
 *  - 包含「库标题照搬」（期望原句也能命中，验证改写不会改差）
 *  - 包含「应该都漏」的题（测试改写也救不了的场景）
 */
export const EVAL_SET: EvalQuestion[] = [
  // ===== 日常说法（库用「未拆封 / 七日 / 特例审核」，用户用「盒子 / 没拆 / 八天」）=====
  { id: "q01", query: "盒子没拆，都八天了，还能退吗？", targetIds: ["unopened-exception"], category: "日常说法" },
  { id: "q02", query: "刚买三天，不想要了，能退吗", targetIds: ["seven-day"], category: "日常说法" },
  { id: "q03", query: "我想要发票", targetIds: ["invoice"], category: "日常说法" },
  { id: "q04", query: "买东西的积分能干嘛", targetIds: ["points"], category: "日常说法" },
  { id: "q05", query: "我手机摔坏了，能修吗", targetIds: ["warranty"], category: "日常说法" },
  { id: "q06", query: "退款多久到账", targetIds: ["refund-arrive"], category: "日常说法" },
  { id: "q07", query: "我要退货，怎么操作", targetIds: ["howto-return"], category: "日常说法" },
  { id: "q08", query: "新疆那边运费多少", targetIds: ["shipping"], category: "日常说法" },

  // ===== 短问句（最瘦的问句，几乎无实体）=====
  { id: "q09", query: "还能吗", targetIds: ["unopened-exception"], category: "短问句" },
  { id: "q10", query: "几天到", targetIds: ["refund-arrive"], category: "短问句" },
  { id: "q11", query: "怎么申请", targetIds: ["howto-return"], category: "短问句" },
  { id: "q12", query: "要发票", targetIds: ["invoice"], category: "短问句" },
  { id: "q13", query: "几天可退", targetIds: ["seven-day"], category: "短问句" },
  { id: "q14", query: "坏了怎么办", targetIds: ["warranty"], category: "短问句" },
  { id: "q15", query: "邮费多少", targetIds: ["shipping"], category: "短问句" },

  // ===== 货号（保留主键查询）=====
  { id: "q16", query: "SKU-88 七天无理由怎么算", targetIds: ["seven-day"], category: "货号" },
  { id: "q17", query: "SKU-88 保修多久", targetIds: ["warranty"], category: "货号" },
  { id: "q18", query: "sku_123 邮费", targetIds: ["shipping"], category: "货号" },

  // ===== 条款号（保留主键查询）=====
  { id: "q19", query: "条款 3.2 怎么理解", targetIds: ["unopened-exception"], category: "条款号" },
  { id: "q20", query: "第 5 条", targetIds: ["seven-day"], category: "条款号" },
  { id: "q21", query: "条款 1 怎么算", targetIds: ["seven-day"], category: "条款号" },

  // ===== 库标题照搬（期望原句直接命中 —— 改写不应该改差）=====
  { id: "q22", query: "七天无理由退货", targetIds: ["seven-day"], category: "库标题照搬" },
  { id: "q23", query: "电子产品保修须知", targetIds: ["warranty"], category: "库标题照搬" },
  { id: "q24", query: "运费说明", targetIds: ["shipping"], category: "库标题照搬" },
  { id: "q25", query: "积分规则", targetIds: ["points"], category: "库标题照搬" },

  // ===== 子问题（多个意图）=====
  { id: "q26", query: "退货几天、保修几年？", targetIds: ["unopened-exception", "warranty"], category: "子问题" },
  { id: "q27", query: "怎么退、运费谁出？", targetIds: ["howto-return", "shipping"], category: "子问题" },
  { id: "q28", query: "发票怎么开、退款多久到账？", targetIds: ["invoice", "refund-arrive"], category: "子问题" },

  // ===== 残句指代（demo 评测不传 history；这里测"裸残句"的检索效果）=====
  { id: "q29", query: "这个呢", targetIds: ["unopened-exception"], category: "残句指代" },

  // ===== 边界：偏僻问题，期望都漏 =====
  { id: "q30", query: "能告诉我今天的天气吗", targetIds: ["unopened-exception", "seven-day", "invoice", "points", "warranty", "refund-arrive", "howto-return", "shipping"], category: "其他" },
];

/** 服务端校验：所有 targetIds 都对应真实 chunk id（防止标注漂移）。 */
export function validateEvalSet(): { ok: boolean; invalidQuestions: string[] } {
  const validIds = new Set(CHUNKS.map((c: Chunk) => c.id));
  const invalid = EVAL_SET
    .filter((q) => q.targetIds.some((tid) => !validIds.has(tid)))
    .map((q) => q.id);
  return { ok: invalid.length === 0, invalidQuestions: invalid };
}