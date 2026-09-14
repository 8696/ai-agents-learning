/**
 * 职责：本步售后知识库。前端必须原样展示这些切块（Chunk），不能自己编一份。
 * 数据流：routes/corpus 原样返回；粗召回 / 精排只按 id 取正文。
 */

export type KnowledgeChunk = {
  id: string;
  title: string;
  text: string;
  /** 对默认问句「该引用哪一段」。只作教学标注，不参与粗召回打分。 */
  shouldCite: boolean;
};

export const DEFAULT_QUERY = "超过 7 天了，盒子没拆，还能退吗？";

/**
 * 粗召回只数这些政策热词。故意不数「没拆 / 未拆封 / 超期 / 特例」——
 * 那是精排才该看见的约束。
 */
export const COARSE_HINTS = {
  退: ["退货", "退回", "退款"],
  天: ["七天", "7天", "十五天"],
} as const;

export const CORPUS: KnowledgeChunk[] = [
  {
    id: "seven-day",
    title: "七天无理由退货",
    text: "商品签收后七天内，可申请无理由退货。包装完整即可退货。七天时限从签收次日算起。退货运费一般由买家承担。",
    shouldCite: false,
  },
  {
    id: "quality-15",
    title: "质量问题十五天包退",
    text: "因质量问题申请退货的，签收后十五天内可包退。需提供开箱视频或检测单。质量问题退货，运费由卖家承担。",
    shouldCite: false,
  },
  {
    id: "shipping-fee",
    title: "退货运费谁承担",
    text: "无理由退货的退回运费由买家承担。卖家原因导致的退货，退回运费由卖家承担。到付件仓库拒收。",
    shouldCite: false,
  },
  {
    id: "exchange",
    title: "同款换货说明",
    text: "七天内可申请同款换货，库存不足时改为退货。换货不重新计算七天无理由时效。",
    shouldCite: false,
  },
  {
    id: "unopened-exception",
    title: "未拆封超期可申请特例审核",
    text: "包装完整、吊牌在、未拆封的商品，即使已经超过常规时限，也可以提交特例审核。审核通过后可以退款到原支付账户。",
    shouldCite: true,
  },
  {
    id: "warranty",
    title: "电子产品保修须知",
    text: "电子产品保修期十二个月，只修不退。人为损坏、进液、私拆不在保修范围。保修与退货政策不是同一条。",
    shouldCite: false,
  },
  {
    id: "points",
    title: "会员积分规则",
    text: "每消费 1 元积 1 分。积分可抵运费券，不能抵现金。积分有效期为自然年。",
    shouldCite: false,
  },
  {
    id: "invoice",
    title: "发票开具说明",
    text: "下单后可在订单详情申请电子发票。发票抬头不能改成个人再改回公司。丢票可重开一次。",
    shouldCite: false,
  },
];

export function getChunkById(id: string): KnowledgeChunk | undefined {
  return CORPUS.find((item) => item.id === id);
}
