/**
 * 职责：真正调用线上模型，把 OpenAI chunk 原样转成 SSE 帧（不做字段提取、不包一层）。
 *
 * 数据流：
 *   { llm, prompt, writer }
 *     → chat.completions.create({ stream:true, stream_options:{ include_usage:true } })
 *     → JSON.parse(JSON.stringify(chunk)) 把 SDK 的 zod 实例 plain 化
 *     → writer.writeRaw(JSON) → 最后 data: [DONE]
 *   上游失败 → writer.frame({ error, upstreamStatus }) → writer.done()
 *
 * 为什么单独成文件：
 *   routes/real.ts 只该做「闸门 + 开流」；把 for await 抄进 route，教学点会被 HTTP 细节淹没。
 *   这里完全不碰 koa 的 ctx。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import { logger } from "../logger.js";
import { describeUpstreamError } from "../http/write-upstream-error.js";
import type { SseWriter } from "../sse/sse-writer.js";

/** GET /api/real 没有 body 时用这句，和旧单页 Demo 的默认问题保持一致。 */
export const DEFAULT_REAL_PROMPT = "用一句话介绍你自己，30 字以内。";

/**
 * 原样转发上游流。
 * ① SDK 返回的 chunk 是 zod 类实例，直接 JSON.stringify 会丢字段，必须先 plain 化
 * ② 控制台打完整 chunk：让终端窗口和浏览器看到同一份协议原文
 * ③ 浏览器已断开就停：继续拉上游只是白烧 Token
 */
export async function streamRealToSse(params: {
  llm: Llm;
  prompt: string;
  writer: SseWriter;
}): Promise<{ frameCount: number; failed?: { message: string; upstreamStatus?: number } }> {
  const { llm, prompt, writer } = params;
  const t0 = performance.now();
  console.log(
    `\n[${(t0 / 1000).toFixed(2)}s] /api/real: 开始调用 ${llm.provider} ${llm.modelA}（baseURL=${llm.baseUrlA}）`,
  );
  logger.info(
    "llm.request",
    "进入 streamRealToSse，准备调真实模型",
    "记录入口参数（provider / model / baseURL / prompt 长度），便于把这次调用和后续 chunk 对上号",
    {
      provider: llm.provider,
      model: llm.modelA,
      baseURL: llm.baseUrlA,
      promptLength: prompt.length,
    },
  );

  try {
    const requestPayload = {
      model: llm.modelA,
      stream: true as const,
      stream_options: { include_usage: true },
      messages: [{ role: "user" as const, content: prompt }],
    };
    logger.info(
      "llm.request",
      "→ 调 llm.openai.chat.completions.create（流式）",
      "真实模型流式转发前先冻结 request：模型 / 流式开关 / stream_options / messages 全部记录，方便出问题时回放排查",
      {
        provider: llm.provider,
        model: llm.modelA,
        baseURL: llm.baseUrlA,
        stream: true,
        streamOptions: { include_usage: true },
        messagesCount: requestPayload.messages.length,
        promptPreview: prompt.length > 60 ? `${prompt.slice(0, 60)}…` : prompt,
        __code: JSON.stringify(requestPayload, null, 2),
      },
    );

    const stream = await llm.openai.chat.completions.create(requestPayload);

    logger.info(
      "llm.response",
      "← got response（流式：拿到的是 Stream 句柄，不是单次对象）",
      "完整打响应便于核对 SDK 自带字段；流式接口不会一次性回 ChatCompletion，回的是可逐帧迭代的 Stream，每帧 chunk 会在循环里单独再打一条 llm.response",
      {
        streamType: stream?.constructor?.name ?? typeof stream,
        controllerState: (stream as unknown as { controller?: unknown })?.controller
          ? "present"
          : "absent",
        isStreamIterable: typeof (stream as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function",
      },
    );

    let frameIdx = 0;
    for await (const chunk of stream) {
      if (writer.isClosed()) break;
      frameIdx += 1;
      // SDK 返回 zod 类实例；plain 化后 JSON.stringify 才能带出完整字段
      const plain = JSON.parse(JSON.stringify(chunk)) as unknown;
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/real 真实 chunk #${frameIdx}: ${JSON.stringify(plain)}`,
      );
      logger.info(
        "llm.response",
        `← chunk #${frameIdx}（流式逐帧）`,
        "流式每个 delta chunk 完整打：核对 choices.delta.content / finish_reason / usage（最后一帧才有）",
        {
          frameIndex: frameIdx,
          chunk: plain,
        },
      );
      writer.writeRaw(JSON.stringify(plain));
    }

    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/real: 完成，共 ${frameIdx} 帧`,
    );
    logger.info(
      "llm.response",
      `← 流式收尾，共 ${frameIdx} 帧`,
      "正常结束：循环退出无错，writer 已写 [DONE]；frameCount 与最后一帧的 usage 是否一致可在这里核对",
      {
        frameCount: frameIdx,
        elapsedMs: Math.round(performance.now() - t0),
      },
    );
    writer.done();
    return { frameCount: frameIdx };
  } catch (error: unknown) {
    const failed = describeUpstreamError(error);
    console.error(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/real error:`,
      error,
    );
    logger.error(
      "llm.response",
      "← 上游 LLM 调用失败",
      "完整打响应便于核对 SDK 自带字段；SSE 已开流，HTTP 状态码改不了，只能用 error 帧通知浏览器；message + upstreamStatus 给排错用",
      {
        message: failed.message,
        upstreamStatus: failed.upstreamStatus,
        elapsedMs: Math.round(performance.now() - t0),
        errorDetail:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { raw: String(error) },
      },
    );
    writer.frame({ error: failed.message, upstreamStatus: failed.upstreamStatus });
    writer.done();
    return { frameCount: 0, failed };
  }
}
