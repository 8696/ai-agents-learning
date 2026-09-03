/**
 * 职责：一次「计费观测」的形状 —— route、flow、前端卡片共用同一份字段名。
 * 数据流：flow/ 产出 BillingMeasurement → ctx.body → 页面 BillingCard 直接按字段渲染。
 * 为什么单独成文件：类型被 flow 里两个文件和两个 route 同时引用，放任一侧都会变成循环依赖。
 */
import type { CostBreakdown } from "../billing/pricing.js";

/** 上游没回 usage 时抛它：这不是网络故障，要单独走 502 并提示去控制台核对。 */
export class MissingUsageError extends Error {
  constructor(message = "上游响应里没有 usage 字段，这次调用的 Token 数无法从 API 读出。") {
    super(message);
    this.name = "MissingUsageError";
  }
}

/** 直接抄自协议响应的 usage 三兄弟，字段名保持和 API 一致，方便和文档对照。 */
export type UsageTriple = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

/** 一次调用的完整观测结果。cost 由 billing/pricing.ts 折算。 */
export type BillingMeasurement = {
  /** 用例名，对照页并排时用来区分两次调用 */
  label: string;
  prompt: string;
  /** 本次请求发出的 max_tokens 上限，决定输出侧最多能烧多少 */
  maxTokens: number;
  model: string;
  reply: string;
  /** finish_reason：stop = 说完了；length = 撞上 max_tokens 被截断 */
  finishReason: string | null;
  usage: UsageTriple;
  cost: CostBreakdown;
  durationMs: number;
};
