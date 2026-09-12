/**
 * 职责：内置一份售后知识库（6 条卡）——本 demo 用来演示「同一库、同一问句，
 * 向量检索（Dense Retrieval）漏编号、BM25 关键词检索（Sparse Retrieval）捞编号」；
 * 以及「口语问，BM25 漏同义、向量能中」。
 *
 * 为什么内置：
 *   本条教学点是「对照」，不是「如何入库」。把语料写死在代码里，每次跑结果稳定、可复盘。
 *   真要导入用户文件见模块 08 第 1 条 RAG 流水线。
 *
 * 数据流：业务读 CORPUS 拿到卡片 id/text；向量侧把 text 送嵌入模型拿向量；
 *         BM25 侧按词算分。
 */
export type KnowledgeCard = {
  id: string;
  /** 给向量检索看的纯文本（不含 id，便于讲解） */
  text: string;
  /** 类别：policy=政策 / product=产品 / sku=编号卡 / error=错误码 */
  kind: "policy" | "product" | "sku" | "error";
};

export const CORPUS: KnowledgeCard[] = [
  {
    id: "sku-8821",
    kind: "sku",
    text: "SKU-8821 路由器专属保修：自激活之日起保修 2 年。配件（电源、网线）保修 1 年。",
  },
  {
    id: "sku-8822",
    kind: "sku",
    text: "SKU-8822 路由器专属保修：自激活之日起保修 1 年。属入门款，不在延保范围。",
  },
  {
    id: "router-policy",
    kind: "policy",
    text: "通用路由器保修政策：所有 SKU 自激活之日起享 1 年基础保修，注册会员后延长至 2 年。",
  },
  {
    id: "shipping-damage",
    kind: "policy",
    text: "运输破损可补发或退货。签收 48 小时内拍照举证（外包装 + 破损细节）即可办理，无需提供物流证明。",
  },
  {
    id: "err-4401",
    kind: "error",
    text: "ERR-4401：库存锁定失败。请重试一次；若仍失败，请更换支付方式或稍后再试。",
  },
  {
    id: "invoice",
    kind: "policy",
    text: "发票默认开个人抬头。如需公司抬头，请在订单备注填写公司全称与税号。",
  },
];

export const PRESET_QUERIES = {
  numbered: "SKU-8821 保修几年？",
  spoken: "杯子裂了怎么退？",
} as const;

/** 给前端讲解用：哪张卡是「该中的卡」——编号问期望命中 sku-8821；口语问期望命中 shipping-damage */
export const EXPECTED_HIT = {
  numbered: "sku-8821",
  spoken: "shipping-damage",
} as const;