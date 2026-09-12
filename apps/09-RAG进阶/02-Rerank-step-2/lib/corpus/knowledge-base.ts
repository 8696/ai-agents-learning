/**
 * 职责：内置一份「售后政策」知识库（17 条卡）——本 demo 用来演示
 *       粗召回（向量 + BM25 + RRF 合成）→ 精排（真调大模型按"问句+文档"成对打分）
 *       → 业务加权（按卡片 updatedAt 与当前日期的差距给非神经分加分）。
 *
 * 为什么内置：本条教学点是「业务加权 vs 神经精排能拆开」，不是「如何入库」。
 * 语料写死，结果稳定、可复盘。
 *
 * 数据流：业务读 CORPUS 拿 id/text/updatedAt；粗召回把 text 当成向量侧语料；
 *         精排把 id+text 当成"问句+文档"对喂给大模型；
 *         业务加权把 updatedAt 与 today 比，距今 ≤ recentDays 的卡片加 bonus。
 */
export type KnowledgeCard = {
  id: string;
  text: string;
  /** 类别：policy=政策 / sku=编号卡 / product=产品 */
  kind: "policy" | "sku" | "product";
  /** 最近一次更新时间（ISO 日期，YYYY-MM-DD）。业务加权规则用它判断「新」 */
  updatedAt: string;
};

/**
 * 教学默认 updatedAt：日期参照「今天 ≈ 2026-09-12」。
 * 默认 3 个月前（2026-06-12）→ 触发不了"近 30 天加权"。
 *
 * 改过的设置（修复「左右两边一样」的画面）：
 *   原 5 张政策卡片（policy-A / B / C / D / E）全部设成"近 30 天内"——这样无论神经精排怎么挑前 N 条，
 *   候选里至少有 4-5 张"近"的卡片，业务加权一定会触发，能看见名次变化。
 *   sku-K（保温杯保修）+ product-N（陶瓷餐具套装）也设成"近"，让加权后能跳到候选前段。
 *
 * 选了哪 7 张做"新"（距今 1~11 天内）：
 *   policy-A  七天无理由退货总则 → 2026-09-11（1 天前）
 *   policy-B  运输破损补发       → 2026-09-09（3 天前）
 *   policy-D  运费险使用说明      → 2026-09-10（2 天前）
 *   policy-E  会员退货次数上限    → 2026-09-08（4 天前）
 *   sku-C    SKU-8821 路由器保修  → 2026-09-05（7 天前）
 *   sku-K    SKU-7720 保温杯保修  → 2026-09-01（11 天前）
 *   product-N 陶瓷餐具套装        → 2026-09-05（7 天前）
 */
const FAR = "2026-06-12";

export const CORPUS: KnowledgeCard[] = [
  // ===== 原有 5 张（保留，step-1 已锁定） =====
  {
    id: "policy-A",
    kind: "policy",
    text: "七天无理由退货总则：自签收之日起 7 天内，未拆封、未损坏的商品可无理由退货，运费由买家承担。",
    updatedAt: "2026-09-11",
  },
  {
    id: "policy-B",
    kind: "policy",
    text: "运输破损补发：陶瓷、杯类、玻璃器皿在途碎裂走补发，不走七天无理由。签收 48 小时内拍照举证即可办理。",
    updatedAt: "2026-09-09",
  },
  {
    id: "sku-C",
    kind: "sku",
    text: "SKU-8821 路由器专属保修：自激活之日起保修 2 年。配件（电源、网线）保修 1 年。",
    updatedAt: "2026-09-05",
  },
  {
    id: "policy-D",
    kind: "policy",
    text: "运费险使用说明：勾选运费险后退货，平台按实际运费补贴到原支付账户，最高 25 元；签收后 7 天内有效。",
    updatedAt: "2026-09-10",
  },
  {
    id: "policy-E",
    kind: "policy",
    text: "会员退货次数上限：普通会员每自然月最多 3 次无理由退货；黄金会员 6 次；超过部分需联系客服审核。",
    updatedAt: "2026-09-08",
  },

  // ===== 扩到 17 张：12 张字面接近但事不对的干扰卡（沿用 step-1） =====
  {
    id: "policy-F",
    kind: "policy",
    text: "拒签流程：当面开箱验货，如发现破损请直接拒签，物流返仓后由仓库验收再退款；不要签收后再报损。",
    updatedAt: FAR,
  },
  {
    id: "policy-G",
    kind: "policy",
    text: "签收注意事项：建议在签收时让快递员在场开箱检查，如外箱破损或拆封后商品损坏可当场拒收。",
    updatedAt: FAR,
  },
  {
    id: "policy-H",
    kind: "policy",
    text: "陶瓷制品包装标准：陶瓷杯类使用气泡膜 + 瓦楞盒双层包装运输，破损率控制在千分之三以内。",
    updatedAt: FAR,
  },
  {
    id: "product-I",
    kind: "product",
    text: "陶瓷马克杯产品介绍：高温釉烧，容量 350ml，可进微波炉；附礼盒包装，适合送礼。",
    updatedAt: FAR,
  },
  {
    id: "product-J",
    kind: "product",
    text: "玻璃水杯产品介绍：钢化玻璃材质，耐摔不易碎；可装冷热饮；杯身印 logo 定制。",
    updatedAt: FAR,
  },
  {
    id: "sku-K",
    kind: "sku",
    text: "SKU-7720 保温杯专属保修：自激活之日起保修 1 年，仅限非人为损坏；杯盖密封圈属易耗件。",
    updatedAt: "2026-09-01",
  },
  {
    id: "policy-L",
    kind: "policy",
    text: "七天无理由退货的例外：定制类、二次销售类、内衣贴身类不支持无理由；详情请见类目公示。",
    updatedAt: FAR,
  },
  {
    id: "policy-M",
    kind: "policy",
    text: "退货运费说明：非质量问题的退货，运费由买家承担；商品质量问题或卖家发错货由卖家承担来回运费。",
    updatedAt: FAR,
  },
  {
    id: "product-N",
    kind: "product",
    text: "陶瓷餐具套装介绍：8 件套，含 4 杯 4 盘；釉下彩工艺，可进洗碗机；适合家庭日常使用。",
    updatedAt: "2026-09-05",
  },
  {
    id: "policy-O",
    kind: "policy",
    text: "拒签返仓流程：拒签商品由物流公司返至最近仓库，仓库验收后 1-3 个工作日退款到原支付账户。",
    updatedAt: FAR,
  },
  {
    id: "policy-P",
    kind: "policy",
    text: "物流时效说明：大陆地区 3-5 个工作日送达，偏远地区 5-7 个工作日；节假日顺延 1-2 天。",
    updatedAt: FAR,
  },
  {
    id: "policy-Q",
    kind: "policy",
    text: "食品类商品退换政策：未拆封的食品支持 7 天无理由；已拆封的食品类（茶叶、零食、滋补品）不支持退换。",
    updatedAt: FAR,
  },

  // ===== 第二批干扰卡（2 张） =====
  {
    id: "policy-S",
    kind: "policy",
    text: "运费险碎了能退吗：运费险赔付运输途中商品碎了退货运费，最高 25 元；不赔付商品本身损失。",
    updatedAt: FAR,
  },
  {
    id: "policy-T",
    kind: "policy",
    text: "陶瓷杯碎了拒签流程：陶瓷杯类商品碎了请拒签，拒签后退款到原账户，不走补发政策。",
    updatedAt: FAR,
  },

  // ===== 第三批干扰卡（3 张） =====
  {
    id: "policy-X",
    kind: "policy",
    text: "陶瓷杯碎了不赔不补：陶瓷杯碎了运费险不赔、退货运费险不赔、补发政策不适用、走拒签流程。",
    updatedAt: FAR,
  },
  {
    id: "policy-Z",
    kind: "policy",
    text: "陶瓷杯碎了拒收返仓：陶瓷杯碎了拒收，拒收返仓后退款到原账户，不走补发。",
    updatedAt: FAR,
  },
  {
    id: "policy-AA",
    kind: "policy",
    text: "陶瓷杯碎了赔付标准：陶瓷杯碎了不属质量问题不在三包范围；运输破损走补发政策或拒签。",
    updatedAt: FAR,
  },

  // ===== 第四批干扰卡（3 张） =====
  {
    id: "policy-Y",
    kind: "policy",
    text: "运费险碎了退货运费：运费险赔付商品碎了退货运费，最高 25 元；不赔付商品本身损失。",
    updatedAt: FAR,
  },
  {
    id: "product-Z",
    kind: "product",
    text: "玻璃杯碎了退款吗：玻璃水杯碎了由商家补发或全额退款，48 小时内拍照举证即可办理。",
    updatedAt: FAR,
  },
  {
    id: "policy-BB",
    kind: "policy",
    text: "陶瓷杯碎了拒签流程：陶瓷杯类商品碎了请拒签，拒签后退款到原账户，不走补发政策。",
    updatedAt: FAR,
  },
];

/** 教学默认问句 —— 「杯子碎了」字面没说"运输"也没说"补发"，向量/BM25 都难捞到 B */
export const PRESET_QUERY = "杯子在路上碎了能退吗";

/** 期望精排后 B 升到前面、A 落到后面 —— 验证"名次会跳"的核心画面 */
export const EXPECTED_HIT = "policy-B";

/** 教学锚点：今天（≈ 2026-09-12）。业务加权规则用它算"近 N 天"差值。 */
export const TODAY_ISO = "2026-09-12";

/** 业务加权默认配置 —— 跟 step-2 页面默认值一致 */
export const DEFAULT_BUSINESS_WEIGHT = {
  /** 是否启用业务加权；关闭时等同纯神经精排 */
  on: true,
  /** "近 N 天编辑过"的窗口（天）；卡片 updatedAt 距今 ≤ recentDays → 加权 */
  recentDays: 30,
  /** 加权分大小（神经分之外的额外分） */
  bonus: 0.3,
};