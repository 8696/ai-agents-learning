/**
 * 职责：协议 A 思考文本的抽取 —— 独立字段优先，否则从 content 里的标记切。
 * 数据流：OpenAI message / delta → { thinking, answer|content }。
 * 为什么单独成文件：一次性与流式共用同一套判定；混进 send 函数会让 SDK 调用显得很乱。
 *
 * JSX 页面若要写这些标记，必须 {"<think>"}，本文件是 TS 字符串，不受那条限制。
 */
export const THINK_OPEN = "<think>";
export const THINK_CLOSE = "</think>";

export type ProtocolADelta = {
  content?: string | null;
  reasoning?: string;
  reasoning_content?: string;
  reasoning_details?: Array<{ text?: string }>;
  thinking?: string;
};

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
} {
  const split = reasoningTextFromDelta(message);
  const content = typeof message.content === "string" ? message.content : "";
  if (split) return { thinking: split, answer: content.trim() };
  return extractThinkFromString(content);
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

/** 协议 A 主动开思考并拆字段。不传 budget 也要开，否则换模型就看不见思考。 */
export const PROTOCOL_A_THINKING = {
  temperature: 1,
  max_tokens: 2048,
  extra_body: {
    thinking: { type: "adaptive" as const },
    reasoning_split: true,
    service_tier: "standard" as const,
  },
};
