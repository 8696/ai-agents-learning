/**
 * 职责：协议 B 流式 —— 只碰 anthropic Messages 流，按官方方言开/关思考并拆帧。
 * 数据流：StreamBody → planProtocolB → thinking / output_config → messages.stream
 *   → content_block_delta.delta.thinking | delta.text → SSE thinking/content/raw/usage/thinking-map。
 * 本文件禁止 import openai。
 */
import type { Llm } from "../../../../llm.js";
import type { ChatTurn, StreamBody } from "../compare/stream-types.js";
import { classifyReturnShape, writeMeta } from "../compare/thinking-meta.js";
import { planProtocolB } from "../dialect/thinking-dialect.js";
import type { SseWriter } from "../http/sse-writer.js";
import { logger } from "../logger.js";

function toPlain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function buildMessagesB(turns: ChatTurn[]) {
  return turns.map((turn) => ({
    role: turn.role,
    content: turn.role === "assistant" ? turn.content.trim() || "（这一轮没有正文）" : turn.content,
  }));
}

function switchSnippetB(plan: {
  thinking?: Record<string, unknown>;
  outputConfig?: { effort: string };
}): unknown {
  const out: Record<string, unknown> = {};
  if (plan.thinking) out.thinking = plan.thinking;
  if (plan.outputConfig) out.output_config = plan.outputConfig;
  return Object.keys(out).length > 0 ? out : { "(未传思考字段)": "靠这家默认行为" };
}

export async function sendStreamB(
  llm: Llm,
  body: StreamBody,
  writer: SseWriter,
): Promise<void> {
  const plan = planProtocolB(body.provider, body.thinkingOn);
  const maxTokens = Math.max(llm.maxTokensB, 4096);
  const request: Record<string, unknown> = {
    model: llm.modelB,
    max_tokens: maxTokens,
    temperature: 1,
    system: body.system,
    messages: buildMessagesB(body.messages),
  };
  if (plan.thinking) request.thinking = plan.thinking;
  if (plan.outputConfig) request.output_config = plan.outputConfig;

  if (
    !writeMeta(writer, {
      llm,
      protocol: "B",
      request,
      explain: plan.explain,
      switchSnippet: switchSnippetB(plan),
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
    "llm.request.protocolB",
    `→ 协议 B 请求 ${llm.provider}（${body.thinkingOn ? "thinking 开" : "thinking 关"}）`,
    "打完整请求体便于对照 SDK 实际发出去的字段；meta 帧之后立刻补一条原始 JSON，highlight 顶层 thinking / output_config 是不是按 plan 写好",
    {
      endpoint: "POST {baseUrlB}/v1/messages（stream）",
      model: request.model,
      messagesCount: Array.isArray(request.messages) ? request.messages.length : 0,
      stream: true,
      thinkingOn: body.thinkingOn,
      thinking: request.thinking ?? null,
      outputConfig: request.output_config ?? null,
      system: request.system,
      maxTokens: request.max_tokens,
      __code: JSON.stringify(request, null, 2),
    },
  );

  const sources: string[] = [];
  const thinkingText = { length: 0, chunks: 0, source: "delta.thinking" as const };
  try {
    const stream = llm.anthropic.messages.stream(
      request as unknown as Parameters<Llm["anthropic"]["messages"]["stream"]>[0],
    );
    logger.info(
      "llm.response.protocolB",
      "← 协议 B 已建流，等待 streamEvent",
      "完整打响应起步状态便于核对 SDK 自带字段；首个 content_block_start 之前的握手对象",
      { streamReady: true, awaitingFirstEvent: true },
    );
    stream.on("streamEvent", (evt: unknown) => {
      const plain = toPlain(evt) as {
        type?: string;
        delta?: { thinking?: string; text?: string };
        usage?: unknown;
      };
      writer.frame({ type: "raw", frame: plain });
      if (plain.type === "content_block_delta") {
        const d = plain.delta ?? {};
        if (d.thinking != null) {
          if (!sources.includes("delta.thinking")) sources.push("delta.thinking");
          thinkingText.chunks += 1;
          thinkingText.length += d.thinking.length;
          logger.debug(
            "llm.response.protocolB.thinking",
            "thinking delta（协议 B · delta.thinking）",
            "thinking 流式逐事件打：核对 Anthropic-style 块是不是 content_block_delta.delta.thinking 而不是嵌进 delta.text",
            {
              source: "delta.thinking",
              deltaText: d.thinking,
              deltaLength: d.thinking.length,
            },
          );
          writer.frame({ type: "thinking", text: d.thinking, source: "delta.thinking" });
        } else if (d.text != null) {
          writer.frame({ type: "content", text: d.text });
        }
      } else if (plain.type === "message_delta" && plain.usage) {
        writer.frame({ type: "usage", usage: plain.usage });
      }
    });
    await stream.finalMessage();
    logger.info(
      "llm.response.protocolB.thinking.summary",
      `← 协议 B 流结束 · thinking 累计 ${thinkingText.length} 字符 / ${thinkingText.chunks} 个 delta`,
      "thinking 流式结束后打汇总：核对 sources / chunks / total length 与页面 thinking-map 一致",
      {
        sourcesSeen: sources,
        thinkingChunks: thinkingText.chunks,
        thinkingTextLength: thinkingText.length,
        source: thinkingText.source,
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
      "llm.response.protocolB",
      "← 协议 B 流异常",
      "把原始异常对象打出来便于排错（Anthropic SDK 抛的错常带 status / headers）",
      { errorMessage: msg, errorObject: err },
    );
    writer.frame({ type: "error", error: msg });
  }
}
