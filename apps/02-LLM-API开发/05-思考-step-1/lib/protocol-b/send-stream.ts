/**
 * 职责：协议 B 流式 —— 只碰 anthropic Messages 流，按官方方言开/关思考并拆帧。
 * 数据流：StreamBody → planProtocolB → thinking / output_config → messages.stream
 *   → content_block_delta.delta.thinking | delta.text → SSE thinking/content/raw/usage/thinking-map。
 * 本文件禁止 import openai。
 *
 * 日志（§5.3.16）：调用函数 五件套（sendStreamB 封装层），调用模型 五件套（出网层，含 __code + 字段释义）；
 *   流式规则：只在收尾打一次完整返回值；thinking event 用 debug 单独打便于核对「Anthropic-style 块是不是 content_block_delta.delta.thinking」。
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
  const tFuncStart = Date.now();
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

  logger.info(
    "│ 协议B-sendStreamB",
    "调用函数开始：sendStreamB",
    "为什么打：route 只认这一层把 SSE 帧写到 res；里面那次才是出网（看「调用模型开始：协议B-消息流」）。当前：即将发协议 B 流式请求；plan 由 dialect 按 provider × thinkingOn 拼。",
    {
      入参: { provider: body.provider, protocol: "B", thinkingOn: body.thinkingOn, turnsCount: body.messages.length },
      __code: `const stream = llm.anthropic.messages.stream(${JSON.stringify(request, null, 2)});`,
    },
  );

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

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-协议B 消息流",
    "调用模型开始：协议B 消息流",
    "为什么打：本文件唯一的真出网层；不打就没有 thinking 流式各事件来源（content_block_delta.delta.thinking）。当前：即将发出 messages.stream 请求。",
    {
      入参: {
        endpoint: "POST {baseUrlB}/v1/messages（stream）",
        model: request.model,
        messagesCount: Array.isArray(request.messages) ? request.messages.length : 0,
        stream: true,
        thinkingOn: body.thinkingOn,
        thinking: request.thinking ?? null,
        outputConfig: request.output_config ?? null,
        maxTokens: request.max_tokens,
      },
      __code: `llm.anthropic.messages.stream(${JSON.stringify(request, null, 2)});`,
    },
  );

  const sources: string[] = [];
  const thinkingText = { length: 0, chunks: 0, source: "delta.thinking" as const };
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
          thinkingText.chunks += 1;
          thinkingText.length += d.thinking.length;
          logger.debug(
            "││ 调用模型-协议B 消息流",
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
    // 流式规则（§5.3.16）：只在收尾打一次完整返回值。
    logger.info(
      "││ 调用模型-协议B 消息流",
      "调用模型结束：协议B 消息流",
      "为什么打：流式场景只在收尾打一次完整返回值（thinking 累计 / sources / returnShape），便于核对页面 thinking-map。当前：finalMessage 已返回，下一步 writer.frame(thinking-map) + done()。",
      {
        返回值: {
          sourcesSeen: sources,
          thinkingChunks: thinkingText.chunks,
          thinkingTextLength: thinkingText.length,
          returnShape: classifyReturnShape(sources),
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          sourcesSeen: "本次流式里实际出现过的思考来源（delta.thinking）",
          returnShape: "思考以哪条 SDK 字段返回（reasoning_field / content_tag / none / mixed）",
        },
      },
    );
    logger.info(
      "│ 协议B-sendStreamB",
      "调用函数结束：sendStreamB",
      "为什么打：route 已经把 thinking-map + [DONE] 写出，连接关闭；打耗时便于和协议 A 流式对照。当前：流已消费完。",
      {
        返回值: {
          sourcesSeen: sources,
          thinkingChunks: thinkingText.chunks,
          thinkingTextLength: thinkingText.length,
        },
        耗时ms: Date.now() - tFuncStart,
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
      "││ 调用模型-协议B 消息流",
      "调用模型结束：协议B 消息流（失败）",
      "为什么打：拿到 SDK 错误对象（Anthropic SDK 抛的错常带 status / headers）便于排错。当前：stream 抛错；已写 error 帧。",
      {
        返回值: { errorMessage: msg },
        耗时ms: Date.now() - tModelStart,
        错误: err,
      },
    );
    logger.error(
      "│ 协议B-sendStreamB",
      "调用函数结束：sendStreamB（失败）",
      "为什么打：route 要把 error 帧交给客户端；记 err 便于排错。当前：上游异常，已写 error 帧。",
      {
        返回值: { errorMessage: msg },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    writer.frame({ type: "error", error: msg });
  }
}