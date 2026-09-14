/**
 * 职责：本步知识库的 8 个切块（Chunk）。只存在服务端，前端必须经 GET /api/corpus 拿。
 * 数据流：静态数组 → 检索按 text 打词重叠分。isTarget 标出「该引用的那一条」。
 *
 * 为什么这样写正文：
 *  目标切块故意不用「退 / 盒子 / 没拆 / 八天」，只用「未拆封 / 七日 / 特例审核」。
 *  用户原句对不上这些词 → 原句检索它没进检索名单；改写成库用语后才进检索名单。
 */

export type Chunk = {
  id: string;
  title: string;
  text: string;
  /** 本步默认问句真正该引用的那一段 */
  isTarget: boolean;
};

export const CHUNKS: Chunk[] = [
  {
    id: "seven-day",
    title: "七天无理由退货",
    text: "购买之日起七天内，商品完好可办理七天无理由退货。超过七日不适用本条。",
    isTarget: false,
  },
  {
    id: "unopened-exception",
    title: "未拆封超过七日的特例审核",
    text: "未拆封商品超过七日，可申请特例审核。审核通过后由质检决定是否收货。本条只认未拆封与七日，不认外包装上的日常说法。",
    isTarget: true,
  },
  {
    id: "invoice",
    title: "发票与报销",
    text: "电子发票在订单完成后自动发送到注册邮箱。报销请下载 PDF 原件。",
    isTarget: false,
  },
  {
    id: "points",
    title: "积分规则",
    text: "每消费 1 元累计 1 积分。积分不可抵扣运费，不可兑换现金。",
    isTarget: false,
  },
  {
    id: "warranty",
    title: "电子产品保修须知",
    text: "主机保修一年，配件保修三个月。进液、摔损等人为损坏不在保修范围。",
    isTarget: false,
  },
  {
    id: "refund-arrive",
    title: "退款到账时间",
    text: "原路退回一般 3 到 7 个工作日到账。具体到账时间以发卡行为准。",
    isTarget: false,
  },
  {
    id: "howto-return",
    title: "如何申请退款工单",
    text: "登录订单页点击申请售后，填写物流单号。本页只讲提交流程，不讲资格。",
    isTarget: false,
  },
  {
    id: "shipping",
    title: "运费说明",
    text: "偏远地区加收运费。签收后非质量问题的寄回，运费由用户自理。",
    isTarget: false,
  },
];

export const DEFAULT_QUERY = "盒子没拆，都八天了，还能退吗？";
export const TARGET_ID = "unopened-exception";
