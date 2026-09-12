/**
 * 职责：内置判定用例列表——同一库上，手写 BM25 与 wink-bm25-text-search 各跑一次，
 *       用「期望 Top-1」自动打过 / 不过。
 *
 * 数据流：前端拉 GET /api/judge-cases → 点跑 → 服务端按 case 调对照 → 返回判定。
 */

export type JudgeRule = "top1-equals" | "top1-miss";

export type JudgeCase = {
  id: string;
  title: string;
  question: string;
  rule: JudgeRule;
  expectTop1: string | null;
  explain: string;
};

/** 内置判定列表（对应当前 CORPUS：云 API 售后） */
export const JUDGE_CASES: JudgeCase[] = [
  {
    id: "numbered-key",
    title: "带货号的问句 · 生产密钥 ID",
    question: "API-KEY-7741 怎么轮换",
    rule: "top1-equals",
    expectTop1: "api-key-7741",
    explain: "稀有整词 API-KEY-7741 一对上，两侧 Top-1 都该是生产密钥卡。",
  },
  {
    id: "error-code",
    title: "错误码问 · ERR-9020",
    question: "ERR-9020 什么意思",
    rule: "top1-equals",
    expectTop1: "err-9020",
    explain: "错误码几乎只出现一次，BM25 应把签名失败那张卡打到最前。",
  },
  {
    id: "billing",
    title: "政策字段 · 公司发票",
    question: "公司抬头发票怎么开",
    rule: "top1-equals",
    expectTop1: "billing-invoice",
    explain: "「公司 / 抬头 / 发票」对上账单发票卡。",
  },
  {
    id: "neighbor-key",
    title: "近邻编号 · 别抢错密钥",
    question: "API-KEY-7742 过期怎么办",
    rule: "top1-equals",
    expectTop1: "api-key-7742",
    explain: "7741 与 7742 字面极像；必须认准稀有整词，不能串到生产密钥卡。",
  },
  {
    id: "english-no-overlap",
    title: "无共同词 · 英文口语对中文库",
    question: "how to return a cracked mug",
    rule: "top1-miss",
    expectTop1: "webhook-retry",
    explain: "英文问句与中文 Webhook 政策几乎没有共同词；不该把 webhook-retry 稳稳打成 Top-1（或名单空）。这是向量该补的洞。",
  },
];
