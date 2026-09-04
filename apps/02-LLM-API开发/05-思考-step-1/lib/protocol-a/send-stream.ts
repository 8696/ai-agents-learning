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
import { logger } from "../logger.js";

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

  logger.info(
    "llm.request.protocolA",
    `→ 协议 A 请求 ${llm.provider}（${body.thinkingOn ? "thinking 开" : "thinking 关"} / reasoning_split=${body.reasoningSplit}）`,
    "打完整请求体便于对照 SDK 实际发出去的字段；meta 帧之后立刻补一条原始 JSON，方便看 meta 调整后还差什么",
    {
      endpoint: "POST {baseUrlA}/chat/completions",
      model: request.model,
      messagesCount: Array.isArray(request.messages) ? request.messages.length : 0,
      stream: true,
      thinkingOn: body.thinkingOn,
      reasoningSplit: body.reasoningSplit,
      extraBody: request.extra_body ?? null,
      omitSampling: Boolean(plan.omitSampling),
      maxTokens: request.max_tokens,
      __code: JSON.stringify(request, null, 2),
    },
  );

  const state = { inThink: false, reasoningSeen: "" };
  const sources: string[] = [];
  const thinkingText = { length: 0, chunks: 0, source: null as ThinkingSourceA | null };
  try {
    const stream = (await llm.openai.chat.completions.create(
      request as never,
    )) as unknown as AsyncIterable<unknown>;
    logger.info(
      "llm.response.protocolA",
      "← 协议 A 已建流，等待 chunk",
      "完整打响应起步状态便于核对 SDK 自带字段；首 chunk 之前的握手对象",
      { streamReady: true, awaitingFirstChunk: true },
    );
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
      if (split.thinking) {
        thinkingText.chunks += 1;
        thinkingText.length += split.thinking.length;
        if (!thinkingText.source) thinkingText.source = split.source;
        logger.debug(
          "llm.response.protocolA.thinking",
          "thinking delta（协议 A）",
          "thinking 流式逐 chunk 打：完整对照 SDK 走的是 reasoning_details / reasoning_content / <think> 标记里的哪一条路径",
          {
            source: split.source,
            deltaText: split.thinking,
            deltaLength: split.thinking.length,
            reasoningSeenLength: state.reasoningSeen.length,
          },
        );
        if (!writer.frame({ type: "thinking", text: split.thinking, source: split.source })) {
          return;
        }
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
    logger.info(
      "llm.response.protocolA.thinking.summary",
      `← 协议 A 流结束 · thinking 累计 ${thinkingText.length} 字符 / ${thinkingText.chunks} 个 delta`,
      "thinking 流式结束后打汇总：核对 sources / chunks / total length 与页面 thinking-map 一致",
      {
        sourcesSeen: sources,
        thinkingChunks: thinkingText.chunks,
        thinkingTextLength: thinkingText.length,
        primarySource: thinkingText.source,
        returnShape: classifyReturnShape(sources),
      },
    );
    writer.frame({
      type: "thinking-map",
      sources,
      returnShape: classifyReturnShape(sources),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      "llm.response.protocolA",
      "← 协议 A 流异常",
      "把原始异常对象打出来便于排错（SDK 抛的错常带 status / headers）",
      { errorMessage: msg, errorObject: err },
    );
    writer.frame({ type: "error", error: msg });
  }
}
