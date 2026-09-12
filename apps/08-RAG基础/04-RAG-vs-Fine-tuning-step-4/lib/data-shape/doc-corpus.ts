/**
 * 职责：内置本 step 的「文档段落」示例 —— 给检索增强生成喂的就是这种材料。
 * 数据流：routes/data-shape.ts 读 → 返回给前端 → 渲染在左栏。
 *
 * 为什么单独成文件：与「问答对」分别管理 —— 两者长得完全不一样，不能混。
 *   检索增强生成 = 喂「文档段落」（陈述事实的原文）
 *   微调          = 喂「问答对」（用户原话 → 理想答）
 */
export type DocChunk = {
  docId: string;
  source: string;
  section: string;
  text: string;
};

export const DOC_CORPUS: DocChunk[] = [
  {
    docId: "refund-v2-001",
    source: "refund-v2.md",
    section: "退货总规则",
    text: "本政策自 2026 年 9 月 1 日起施行。无理由退货期限由原 7 天调整为 3 天（自签收日起算，含法定节假日）。买家承担运费；商品质量问题退货由卖家承担运费。卖家收到退货商品后 3 个工作日内退款，原路返回。",
  },
  {
    docId: "refund-v2-002",
    source: "refund-v2.md",
    section: "客服口吻",
    text: "售后客服统一口吻：先道歉、再结论、再依据。不允许使用「亲」「绝对」「包您满意」等夸张表达。",
  },
  {
    docId: "refund-v2-003",
    source: "refund-v2.md",
    section: "FAQ：发票与保修",
    text: "本公司所有商品均提供电子发票（默认开具），如需纸质发票请下单时备注。商品保修期按品类分：电子产品 1 年、家电 3 年、服装 30 天（无质量问题不退不换）。",
  },
  {
    docId: "refund-v2-004",
    source: "refund-v2.md",
    section: "FAQ：会员等级",
    text: "会员分四档：普通、银卡（累计消费满 1000 元）、金卡（5000 元）、钻石（20000 元）。银卡及以上享 9.5 折，金卡 9 折，钻石 8.5 折。等级按累计消费金额升级，降级需连续 12 个月未消费。",
  },
];