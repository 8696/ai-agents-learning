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
 *
 * 日志（§5.3.16）：调用函数 五件套（streamRealToSse 封装层），调用模型 五件套（出网层，含 __code + 字段释义）；
 *   流式规则（§5.3.16）：只在收尾打一次完整返回值，中间 chunk 不套五件套。
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
  const tFuncStart = Date.now();

  console.log(
    `\n[${(t0 / 1000).toFixed(2)}s] /api/real: 开始调用 ${llm.provider} ${llm.modelA}（baseURL=${llm.baseUrlA}）`,
  );
  logger.info(
    "│ 真实流式-streamRealToSse",
    "调用函数开始：streamRealToSse",
    "为什么打：route 只认这一层返回的 { frameCount, failed? }；里面那次才是出网（看「调用模型开始：对话补全」）。当前：即将拼请求体并发出流式 create。",
    {
      入参: { provider: llm.provider, model: llm.modelA, baseURL: llm.baseUrlA, promptLen: prompt.length },
      __code: `const stream = await llm.openai.chat.completions.create(requestPayload);`,
    },
  );

  const requestPayload = {
    model: llm.modelA,
    stream: true as const,
    stream_options: { include_usage: true },
    messages: [{ role: "user" as const, content: prompt }],
  };

  const tModelStart = Date.now();
  logger.info(
    "││ 调用模型-对话补全",
    "调用模型开始：对话补全",
    "为什么打：真正出网的那一次；不打就没有 frameCount / usage。当前：在 streamRealToSse 里即将发出 stream:true 请求。",
    {
      入参: {
        provider: llm.provider,
        model: requestPayload.model,
        baseURL: llm.baseUrlA,
        stream: requestPayload.stream,
        streamOptions: requestPayload.stream_options,
        messagesCount: requestPayload.messages.length,
        promptPreview: prompt.length > 60 ? `${prompt.slice(0, 60)}…` : prompt,
      },
      __code: `const stream = await llm.openai.chat.completions.create(${JSON.stringify(requestPayload, null, 2)});`,
    },
  );

  try {
    const stream = await llm.openai.chat.completions.create(requestPayload);

    let frameIdx = 0;
    let lastChunk: unknown = null;
    for await (const chunk of stream) {
      if (writer.isClosed()) break;
      frameIdx += 1;
      // SDK 返回 zod 类实例；plain 化后 JSON.stringify 才能带出完整字段
      const plain = JSON.parse(JSON.stringify(chunk)) as unknown;
      lastChunk = plain;
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/real 真实 chunk #${frameIdx}: ${JSON.stringify(plain)}`,
      );
      // 流式规则（§5.3.16）：中间 chunk 不套五件套——最多 debug 一句；这里打 info 是教学档要逐帧可见
      logger.info(
        "││ 调用模型-对话补全",
        `← 真实 chunk #${frameIdx}（流式逐帧）`,
        "流式每个 delta chunk 完整打：核对 choices.delta.content / finish_reason / usage（最后一帧才有）。",
        {
          frameIndex: frameIdx,
          chunk: plain,
        },
      );
      writer.writeRaw(JSON.stringify(plain));
    }

    // 流式规则（§5.3.16）：只在收尾打一次完整返回值（和最终给页面的那份一致）。
    logger.info(
      "││ 调用模型-对话补全",
      "调用模型结束：对话补全",
      "为什么打：流式场景只在收尾打一次完整返回值，便于核对 final usage / frameCount。当前：for await 已退出，下一步 writer.done()。",
      {
        返回值: {
          frameCount: frameIdx,
          lastChunkSummary: lastChunk && typeof lastChunk === "object"
            ? {
                id: (lastChunk as { id?: string }).id,
                model: (lastChunk as { model?: string }).model,
                finishReason: (lastChunk as { choices?: { finish_reason?: string }[] }).choices?.[0]?.finish_reason,
                usage: (lastChunk as { usage?: unknown }).usage,
              }
            : null,
        },
        耗时ms: Date.now() - tModelStart,
        字段释义: {
          frameCount: "本次流式共推给浏览器多少个 SSE 帧",
          "lastChunk.usage": "OpenAI 流式最后一帧带回来的 usage（prompt_tokens / completion_tokens / total_tokens）",
          "lastChunk.choices[0].finish_reason": "stop=正常 / length=撞 max_tokens",
        },
      },
    );

    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/real: 完成，共 ${frameIdx} 帧`,
    );
    writer.done();
    const result = { frameCount: frameIdx };

    logger.info(
      "│ 真实流式-streamRealToSse",
      "调用函数结束：streamRealToSse",
      "为什么打：route 要把 stats 写给客户端（成功路径只打帧数）；耗时是页面 TTFT 对照的另一把尺。当前：stream 已消费完，writer 已 done。",
      {
        返回值: { frameCount: result.frameCount, failed: undefined },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return result;
  } catch (error: unknown) {
    const failed = describeUpstreamError(error);
    console.error(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/real error:`,
      error,
    );
    logger.error(
      "││ 调用模型-对话补全",
      "调用模型结束：对话补全（失败）",
      "为什么打：拿到 upstreamStatus 才能区分 401/403（Key）、429（限流）、5xx（对方挂了）。当前：create 抛错，SSE 头已发完只能以错误帧回页面。",
      {
        返回值: failed,
        耗时ms: Date.now() - tModelStart,
        错误: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
      },
    );
    logger.error(
      "│ 真实流式-streamRealToSse",
      "调用函数结束：streamRealToSse（失败）",
      "为什么打：route 要把 failed stats 交给客户端，靠 error 帧里的 upstreamStatus 排错。当前：writer 已写 error 帧 + done。",
      {
        返回值: { frameCount: 0, failed },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    writer.frame({ error: failed.message, upstreamStatus: failed.upstreamStatus });
    writer.done();
    return { frameCount: 0, failed };
  }
}