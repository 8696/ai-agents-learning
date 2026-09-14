/**
 * 职责：本步的 20 条评测问句 + 每条「该引用的切块 id」。
 * 教学简化：mock 故意偏向「unopened-exception」，让召回 vs 精排有清晰对照。
 * 设计：简单 7 条（召回能命中）+ 中等 8 条（召回上桌但不在前 K）+ 难 5 条（窗里没有）。
 */

export type EvalQuery = {
  /** 评测编号，方便页面定位 */
  id: number;
  /** 问句 */
  query: string;
  /** 该引用的切块 id（评测集人工标注） */
  expectedId: string;
  /** 难度：simple / medium / hard */
  difficulty: "simple" | "medium" | "hard";
};

export const EVAL_SET: EvalQuery[] = [
  // ── 简单：召回能命中（直接命中 Top-5） ──
  { id: 1,  query: "七天无理由退货怎么算？",                       expectedId: "seven-day",           difficulty: "simple" },
  { id: 2,  query: "退货运费由谁承担？",                          expectedId: "shipping-fee",        difficulty: "simple" },
  { id: 3,  query: "十五天退货政策是什么？",                      expectedId: "quality-15",          difficulty: "simple" },
  { id: 4,  query: "七天换货怎么操作？",                          expectedId: "exchange",            difficulty: "simple" },
  { id: 5,  query: "电子产品的保修期是多久？",                    expectedId: "warranty",            difficulty: "simple" },
  { id: 6,  query: "发票丢了怎么办？",                            expectedId: "invoice",             difficulty: "simple" },
  { id: 7,  query: "会员积分能抵运费吗？",                        expectedId: "points",              difficulty: "simple" },

  // ── 中等：召回能捞上桌但不在前 K（需要精排抬上来）──
  { id: 8,  query: "盒子没拆，过了7天还能退吗？",                expectedId: "unopened-exception",  difficulty: "medium" },
  { id: 9,  query: "包装完整的超期订单怎么退款？",                expectedId: "unopened-exception",  difficulty: "medium" },
  { id: 10, query: "未拆封超期可不可以申请审核？",                expectedId: "unopened-exception",  difficulty: "medium" },
  { id: 11, query: "吊牌没拆可以特例申请吗？",                    expectedId: "unopened-exception",  difficulty: "medium" },
  { id: 12, query: "已过常规时限但包装完整怎么办？",              expectedId: "unopened-exception",  difficulty: "medium" },
  { id: 13, query: "特例审核通过后会退款到哪？",                  expectedId: "unopened-exception",  difficulty: "medium" },
  { id: 14, query: "退货运费到付件仓库收吗？",                    expectedId: "shipping-fee",        difficulty: "medium" },
  { id: 15, query: "质量问题退货运费谁出？",                      expectedId: "quality-15",          difficulty: "medium" },

  // ── 难：召回召回窗里没有（精排也救不回——必须回头修召回）──
  { id: 16, query: "特价商品能七天无理由退吗？",                  expectedId: "seven-day",           difficulty: "hard" },
  { id: 17, query: "充值卡余额能退吗？",                          expectedId: "seven-day",           difficulty: "hard" },
  { id: 18, query: "签收后发现破损怎么办？",                      expectedId: "quality-15",          difficulty: "hard" },
  { id: 19, query: "运费险怎么理赔？",                            expectedId: "shipping-fee",        difficulty: "hard" },
  { id: 20, query: "未拆封电器过保还能退吗？",                    expectedId: "unopened-exception",  difficulty: "hard" },
];
