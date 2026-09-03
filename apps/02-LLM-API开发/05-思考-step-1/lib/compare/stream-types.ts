/**
 * 职责：协议无关的一轮请求形状（A/B 共用同一份 prompt / 开关）。
 * 数据流：request-guards 校验后的 body → protocol-a / protocol-b 的 send-stream。
 * 为什么放 compare/：这是对照例外里「真正协议无关」的部分，不进任一协议目录。
 */
import type { ProductionProviderId } from "../../../../llm.js";

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
};

export type StreamBody = {
  provider: ProductionProviderId;
  protocol: "A" | "B";
  thinkingOn: boolean;
  reasoningSplit: boolean;
  system: string;
  messages: ChatTurn[];
};
