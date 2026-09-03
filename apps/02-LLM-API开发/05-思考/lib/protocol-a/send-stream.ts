/**
 * 职责：协议 A 流式 —— 只碰 openai Chat Completions 流，按官方方言开/关思考并拆帧。
 * 数据流：StreamBody → planProtocolA → extra_body → chat.completions.create(stream)
 *   → splitProtocolADelta → SSE thinking/content/raw/usage/thinking-map。
 * 本文件禁止 import @anthropic-ai/sdk。
 */
import type { Llm } from "../../../../llm.js";
import type { ProductionProviderId } from "../../../../llm.js";
import type { ChatTurn, StreamBody } from "../compare/stream-types.js";
import { classifyReturnShape, writeMeta } from "../compare/thinking-meta.js";
import { planProtocolA } from "../dialect/thinking-dialect.js";
import type { SseWriter } from "../http/sse-writer.js";

const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

type ThinkingSourceA = "reasoning_details" | "reasoning_content" | "content_think_tag";

function toPlain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function switchSnippetA(extraBody: Record<string, unknown> | undefined): unknown {
  return extraBody ?? null;
}

/**
 * 追问时要把上一轮思考按该家方言塞回 assistant 消息。
 * MiniMax 既可能要独立字段，也可能要把 think 标记嵌进 content——两份都带上，让上游自己认。
 */
function assistantMessageA(
  provider: ProductionProviderId,
  turn: ChatTurn,
): Record<string, unknown> {
  const thinking = turn.thinking?.trim() ?? "";
  const content = turn.content.trim() || "（这一轮没有正文）";
  if (provider === "minimax") {
    if (!thinking) return { role: "assistant", content };
    return {
      role: "assistant",
      content: `${THINK_OPEN}${thinking}${THINK_CLOSE}\n${content}`,
      reasoning_content: thinking,
    };
  }
  return {
    role: "assistant",
    content,
    ...(thinking ? { reasoning_content: thinking } : {}),
  };
}

function buildMessagesA(
  provider: ProductionProviderId,
  system: string,
  turns: ChatTurn[],
): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = [{ role: "system", content: system }];
  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content });
    } else {
      messages.push(assistantMessageA(provider, turn));
    }
  }
  return messages;
}

/**
 * 协议 A 思考可能出现在三处：reasoning_content、reasoning_details、content 里的 think 标记。
 * ① 有拆分字段时，content 当正文——不要再跑标记状态机，否则会把正文切坏
 * ② 没有拆分时才用标记状态机切 content
 * ③ reasoning_* 有的网关会回「到目前为止的全文」而不是增量，所以要对照 reasoningSeen 去重
 */
function splitProtocolADelta(
  delta: {
    content?: string;
    reasoning_content?: string;
    reasoning_details?: Array<{ text?: string }>;
  },
  state: { inThink: boolean; reasoningSeen: string },
): { thinking: string; content: string; source: ThinkingSourceA | null } {
  let thinking = "";
  const splitPieces: string[] = [];
  let splitSource: ThinkingSourceA | null = null;
  if (Array.isArray(delta.reasoning_details) && delta.reasoning_details.length > 0) {
    for (const detail of delta.reasoning_details) {
      if (typeof detail?.text === "string" && detail.text) splitPieces.push(detail.text);
    }
    if (splitPieces.length > 0) splitSource = "reasoning_details";
  } else if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
    splitPieces.push(delta.reasoning_content);
    splitSource = "reasoning_content";
  }

  if (splitPieces.length > 0) {
    for (const piece of splitPieces) {
      if (piece.startsWith(state.reasoningSeen)) {
        thinking += piece.slice(state.reasoningSeen.length);
        state.reasoningSeen = piece;
      } else {
        thinking += piece;
        state.reasoningSeen += piece;
      }
    }
    return {
      thinking,
      content: typeof delta.content === "string" ? delta.content : "",
      source: thinking ? splitSource : null,
    };
  }

  const raw = typeof delta.content === "string" ? delta.content : "";
  if (!raw) return { thinking: "", content: "", source: null };

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
  return { thinking, content, source: thinking ? "content_think_tag" : null };
}

export async function sendStreamA(
  llm: Llm,
  body: StreamBody,
  writer: SseWriter,
): Promise<void> {
  const plan = planProtocolA(body.provider, body.thinkingOn, body.reasoningSplit);
  const messages = buildMessagesA(body.provider, body.system, body.messages);
  const request: Record<string, unknown> = {
    model: llm.modelA,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 4096,
  };
  // DeepSeek 思考模式会忽略 temperature，不要假装旋钮有效
  if (!plan.omitSampling) {
    request.temperature = 1;
  }
  if (plan.extraBody) {
    request.extra_body = plan.extraBody;
  }

  if (
    !writeMeta(writer, {
      llm,
      protocol: "A",
      request,
      explain: plan.explain,
      switchSnippet: switchSnippetA(plan.extraBody),
      skipped: plan.skip,
    })
  ) {
    return;
  }
  if (plan.skip) {
    writer.frame({ type: "thinking-map", sources: [], returnShape: "none", skipped: true });
    return;
  }

  const state = { inThink: false, reasoningSeen: "" };
  const sources: string[] = [];
  try {
    const stream = (await llm.openai.chat.completions.create(
      request as never,
    )) as unknown as AsyncIterable<unknown>;
    for await (const chunk of stream) {
      const plain = toPlain(chunk);
      if (!writer.frame({ type: "raw", frame: plain })) return;
      const rec = plain as {
        usage?: unknown;
        choices?: Array<{
          delta?: {
            content?: string;
            reasoning_content?: string;
            reasoning_details?: Array<{ text?: string }>;
          };
          finish_reason?: string;
        }>;
      };
      const delta = rec.choices?.[0]?.delta ?? {};
      const split = splitProtocolADelta(delta, state);
      if (split.source && !sources.includes(split.source)) sources.push(split.source);
      if (split.thinking && !writer.frame({ type: "thinking", text: split.thinking, source: split.source })) {
        return;
      }
      if (split.content && !writer.frame({ type: "content", text: split.content })) return;
      if (
        rec.usage &&
        !writer.frame({
          type: "usage",
          usage: rec.usage,
          finish_reason: rec.choices?.[0]?.finish_reason ?? null,
        })
      ) {
        return;
      }
    }
    writer.frame({
      type: "thinking-map",
      sources,
      returnShape: classifyReturnShape(sources),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    writer.frame({ type: "error", error: msg });
  }
}
