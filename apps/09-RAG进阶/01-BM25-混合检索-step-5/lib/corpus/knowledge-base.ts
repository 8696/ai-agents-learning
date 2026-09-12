/**
 * 职责：内置一份「云 API 售后」知识库（6 条卡）——本 demo 用来对照
 *       手写 BM25 vs wink-bm25-text-search；编号 / 错误码 / 近邻 ID / 无共同词。
 *
 * 为什么换主题：step-1～4 已用路由器 SKU 库；本步换一批，避免背熟假数据当真理。
 *
 * 数据流：业务读 CORPUS；手写与 wink 两侧共用同一份。
 */
export type KnowledgeCard = {
  id: string;
  text: string;
  kind: "policy" | "product" | "sku" | "error";
};

export const CORPUS: KnowledgeCard[] = [
  {
    id: "api-key-7741",
    kind: "sku",
    text: "API-KEY-7741 生产密钥轮换：在控制台「密钥」页点轮换，旧密钥宽限期 24 小时后失效。不要把密钥写进前端仓库。",
  },
  {
    id: "api-key-7742",
    kind: "sku",
    text: "API-KEY-7742 测试密钥说明：仅限沙箱环境，每日配额 1000 次；过期后在控制台重新签发，不能用于生产。",
  },
  {
    id: "rate-limit-policy",
    kind: "policy",
    text: "通用限流政策：默认每账号每分钟 60 次请求；触发后返回 HTTP 429，建议指数退避重试。",
  },
  {
    id: "webhook-retry",
    kind: "policy",
    text: "Webhook 投递失败会按 1/5/15 分钟重试三次；三次仍失败则写入死信队列，需在控制台手动重放。",
  },
  {
    id: "err-9020",
    kind: "error",
    text: "ERR-9020：签名校验失败。请核对时间戳是否在 5 分钟内、HMAC 密钥是否用生产密钥、请求体是否被中间件改写。",
  },
  {
    id: "billing-invoice",
    kind: "policy",
    text: "账单与发票：默认电子发票发到注册邮箱；开具公司抬头请在「账单 → 发票信息」填写税号与公司全称，次月可补开。",
  },
];

export const PRESET_QUERIES = {
  numbered: "API-KEY-7741 怎么轮换",
  spoken: "接口老是被限流怎么办",
} as const;

export const EXPECTED_HIT = {
  numbered: "api-key-7741",
  spoken: "rate-limit-policy",
} as const;
