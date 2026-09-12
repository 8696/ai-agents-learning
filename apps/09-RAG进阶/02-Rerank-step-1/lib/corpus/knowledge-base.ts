/**
 * 职责：内置一份「售后政策」知识库（5 条卡）——本 demo 用来演示
 *       粗召回（向量 + BM25 + RRF 合成）→ 精排（真调大模型按"问句+文档"成对打分），
 *       名次跳动。
 *
 * 为什么内置：本条教学点是「两阶段对照 + 名次变化」，不是「如何入库」。
 * 语料写死，结果稳定、可复盘。
 *
 * 数据流：业务读 CORPUS 拿 id/text；粗召回把 text 当成向量侧语料；
 *         精排把 id+text 当成"问句+文档"对喂给大模型。
 */
export type KnowledgeCard = {
  id: string;
  text: string;
  /** 类别：policy=政策 / sku=编号卡 / product=产品 */
  kind: "policy" | "sku" | "product";
};

export const CORPUS: KnowledgeCard[] = [
  {
    id: "policy-A",
    kind: "policy",
    text: "七天无理由退货总则：自签收之日起 7 天内，未拆封、未损坏的商品可无理由退货，运费由买家承担。",
  },
  {
    id: "policy-B",
    kind: "policy",
    text: "运输破损补发：陶瓷、杯类、玻璃器皿在途碎裂走补发，不走七天无理由。签收 48 小时内拍照举证即可办理。",
  },
  {
    id: "sku-C",
    kind: "sku",
    text: "SKU-8821 路由器专属保修：自激活之日起保修 2 年。配件（电源、网线）保修 1 年。",
  },
  {
    id: "policy-D",
    kind: "policy",
    text: "运费险使用说明：勾选运费险后退货，平台按实际运费补贴到原支付账户，最高 25 元；签收后 7 天内有效。",
  },
  {
    id: "policy-E",
    kind: "policy",
    text: "会员退货次数上限：普通会员每自然月最多 3 次无理由退货；黄金会员 6 次；超过部分需联系客服审核。",
  },
];

/** 教学默认问句 —— 「杯子碎了」字面没说"运输"也没说"补发"，向量/BM25 都难捞到 B */
export const PRESET_QUERY = "杯子在路上碎了能退吗";

/** 期望精排后 B 升到前面、A 落到后面 —— 验证"名次会跳"的核心画面 */
export const EXPECTED_HIT = "policy-B";