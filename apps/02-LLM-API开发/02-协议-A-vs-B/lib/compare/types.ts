/**
 * 职责：对照页共用的请求 / 并排结果形状（协议无关）。
 * 数据流：同一份 prompt → 两侧 SDK 各自跑完 → 这里只约定「并排长什么样」。
 * 本文件禁止 import openai / @anthropic-ai/sdk。
 */

/** 所有业务端点共用的入参（system 位置差异在各自 protocol-* 里翻译）。 */
export type DemoCallBody = {
  message: string;
  system?: string;
  /** 协议 A：是否打 extra_body 开思考。不传按 false。 */
  enableThinking: boolean;
  /** 仅 /api/b-thinking-stream 用；缺省 500。 */
  thinkingBudget?: number;
};

/** POST /api/compare：两侧完整响应原样并排（失败侧是 { error }）。 */
export type ComparePair = {
  a: unknown;
  b: unknown;
};

export type ThinkLocation = "reasoning_field" | "embedded_in_content" | "separate_block" | "none";

/** POST /api/think-compare 一张场景卡。字段名跟旧 handler 对齐，前端才能直接渲染。 */
export type ThinkScenario = {
  scenario: string;
  protocol: "A" | "B";
  thinkingParam: unknown;
  contentType?: "string" | "block_array";
  textAnswer?: string;
  thinking?: {
    exists: boolean;
    location: ThinkLocation;
    charCount: number;
    preview: string;
  };
  usage?: unknown;
  finishReason?: string | null;
  stopReason?: string | null;
  error?: string;
};
