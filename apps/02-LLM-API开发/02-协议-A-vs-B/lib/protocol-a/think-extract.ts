/**
 * 职责：协议 A 思考抽取 + 流式帧分类 —— 只用 openai 字段名。
 * 数据流：message / delta / chunk → thinking 文本、正文、kind。
 * 本文件禁止 import @anthropic-ai/sdk。
 *
 * JSX 页面若写这些标记必须 {"<think>"}；本文件是 TS 字符串，不受那条限制。
 */
export const THINK_OPEN = "<think>";
export const THINK_CLOSE = "</think>";

export type ProtocolADelta = {
  role?: string;
  content?: string | null;
  reasoning?: string;
  reasoning_content?: string;
  reasoning_details?: Array<{ text?: string }>;
  thinking?: string;
};

export type OpenAiChunkKind = "role" | "chunk" | "finish" | "usage";

/** 协议 A 主动开思考并拆字段。不传就会换模型看不见思考。 */
export const PROTOCOL_A_THINKING = {
  temperature: 1,
  max_tokens: 2048,
  extra_body: {
    thinking: { type: "adaptive" as const },
    reasoning_split: true,
    service_tier: "standard" as const,
  },
};

export function protocolAExtras(enableThinking: boolean): typeof PROTOCOL_A_THINKING | Record<string, never> {
  return enableThinking ? PROTOCOL_A_THINKING : {};
}

export function extractThinkFromString(content: string): {
  thinking?: string;
  answer: string;
} {
  const thinkRe = /<think>([\s\S]*?)<\/think>/g;
  let thinking = "";
  let answer = "";
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = thinkRe.exec(content)) !== null) {
    answer += content.slice(lastIdx, m.index);
    thinking += m[1];
    lastIdx = m.index + m[0].length;
  }
  answer += content.slice(lastIdx);
  return { thinking: thinking || undefined, answer: answer.trim() };
}

export function reasoningTextFromDelta(delta: ProtocolADelta): string {
  const fromDetails: string[] = [];
  if (Array.isArray(delta.reasoning_details)) {
    for (const detail of delta.reasoning_details) {
      if (typeof detail?.text === "string" && detail.text) fromDetails.push(detail.text);
    }
  }
  if (fromDetails.length > 0) return fromDetails.join("");
  if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
    return delta.reasoning_content;
  }
  if (typeof delta.reasoning === "string" && delta.reasoning) return delta.reasoning;
  if (typeof delta.thinking === "string" && delta.thinking) return delta.thinking;
  return "";
}

export function extractThinkFromProtocolAMessage(message: ProtocolADelta): {
  thinking?: string;
  answer: string;
  location: "reasoning_field" | "embedded_in_content" | "none";
} {
  const split = reasoningTextFromDelta(message);
  const content = typeof message.content === "string" ? message.content : "";
  if (split) {
    return { thinking: split, answer: content.trim(), location: "reasoning_field" };
  }
  const fromTag = extractThinkFromString(content);
  if (fromTag.thinking) {
    return { thinking: fromTag.thinking, answer: fromTag.answer, location: "embedded_in_content" };
  }
  return { answer: content.trim(), location: "none" };
}

/** 流式：有拆分字段时 content 当正文；没有时才用标记状态机切 content。 */
export function splitProtocolADelta(
  delta: ProtocolADelta,
  state: { inThink: boolean; reasoningSeen: string },
): { thinking: string; content: string } {
  const split = reasoningTextFromDelta(delta);
  if (split) {
    let thinking = "";
    if (split.startsWith(state.reasoningSeen)) {
      thinking = split.slice(state.reasoningSeen.length);
      state.reasoningSeen = split;
    } else {
      thinking = split;
      state.reasoningSeen += split;
    }
    return { thinking, content: typeof delta.content === "string" ? delta.content : "" };
  }

  const raw = typeof delta.content === "string" ? delta.content : "";
  if (!raw) return { thinking: "", content: "" };

  let thinking = "";
  let content = "";
  let cursor = 0;
  while (cursor < raw.length) {
    if (state.inThink) {
      const endIdx = raw.indexOf(THINK_CLOSE, cursor);
      if (endIdx === -1) {
        thinking += raw.slice(cursor);
        break;
      }
      thinking += raw.slice(cursor, endIdx);
      cursor = endIdx + THINK_CLOSE.length;
      state.inThink = false;
    } else {
      const startIdx = raw.indexOf(THINK_OPEN, cursor);
      if (startIdx === -1) {
        content += raw.slice(cursor);
        break;
      }
      content += raw.slice(cursor, startIdx);
      cursor = startIdx + THINK_OPEN.length;
      state.inThink = true;
    }
  }
  return { thinking, content };
}

type PlainChunk = {
  choices?: Array<{
    delta?: ProtocolADelta;
    finish_reason?: string | null;
  }>;
  usage?: unknown;
};

/**
 * ① 先认纯 usage 帧（choices 空）—— reasoning_tokens 就在这里
 * ② 再认 finish_reason
 * ③ role 首帧没有 content / reasoning
 * 顺序不能换：finish 帧也可能带 role。
 */
export function classifyOpenAiChunkKind(plain: PlainChunk): OpenAiChunkKind {
  const delta = plain.choices?.[0]?.delta;
  const finishReason = plain.choices?.[0]?.finish_reason;
  const usage = plain.usage;
  if (usage && (!plain.choices || plain.choices.length === 0)) return "usage";
  if (finishReason) return "finish";
  if (
    delta?.role &&
    !delta?.content &&
    !delta?.reasoning_content &&
    !(Array.isArray(delta?.reasoning_details) && delta.reasoning_details.length > 0)
  ) {
    return "role";
  }
  return "chunk";
}
