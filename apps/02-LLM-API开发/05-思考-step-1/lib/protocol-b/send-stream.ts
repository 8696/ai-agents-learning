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

  const sources: string[] = [];
  try {
    const stream = llm.anthropic.messages.stream(
      request as unknown as Parameters<Llm["anthropic"]["messages"]["stream"]>[0],
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
          writer.frame({ type: "thinking", text: d.thinking, source: "delta.thinking" });
        } else if (d.text != null) {
          writer.frame({ type: "content", text: d.text });
        }
      } else if (plain.type === "message_delta" && plain.usage) {
        writer.frame({ type: "usage", usage: plain.usage });
      }
    });
    await stream.finalMessage();
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
