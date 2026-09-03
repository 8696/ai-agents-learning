/**
 * 职责：adapter 对外暴露的统一类型 —— 业务层只看见这些字段，不看见 SDK。
 * 数据流：protocol-a / protocol-b 的原始响应 → 翻译成 UnifiedResponse / UnifiedDelta。
 * 为什么单独成文件：两套协议实现和 HTTP route 都要引用同一份形状，放进任一协议目录都会循环依赖。
 */
export type Protocol = "A" | "B";

export type ThinkingConfig = {
  type: "enabled";
  budget_tokens: number;
};

export type SendMessageOptions = {
  protocol: Protocol;
  message: string;
  system?: string;
  /** 不传或 true：两边都开思考；false：两边都不带思考参数。 */
  enableThinking?: boolean;
  /** 启用思考时协议 B 的 budget；A 走 adaptive，不读这个数。 */
  thinking?: ThinkingConfig;
};

/** adapter 把 A 的 prompt/completion 与 B 的 input/output 都翻成这四个字段。 */
export type UnifiedUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  thinkingTokens?: number;
  cachedTokens?: number;
};

export type UnifiedResponse = {
  content: string;
  thinking?: string;
  stopReason: string;
  usage: UnifiedUsage;
  protocol: Protocol;
  model: string;
};

export type UnifiedDelta =
  | { type: "thinking"; text: string }
  | { type: "content"; text: string }
  | { type: "usage"; usage: UnifiedUsage; stopReason: string; protocol: Protocol; model: string }
  | { type: "done" };

export function thinkingEnabled(opts: SendMessageOptions): boolean {
  return opts.enableThinking !== false;
}
