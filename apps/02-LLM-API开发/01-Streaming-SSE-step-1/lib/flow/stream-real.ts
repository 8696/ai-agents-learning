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

  try {
    const stream = await llm.openai.chat.completions.create({
      model: llm.modelA,
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: "user", content: prompt }],
    });

    let frameIdx = 0;
    for await (const chunk of stream) {
      if (writer.isClosed()) break;
      frameIdx += 1;
      // SDK 返回 zod 类实例；plain 化后 JSON.stringify 才能带出完整字段
      const plain = JSON.parse(JSON.stringify(chunk)) as unknown;
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/real 真实 chunk #${frameIdx}: ${JSON.stringify(plain)}`,
      );
      writer.writeRaw(JSON.stringify(plain));
    }

    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/real: 完成，共 ${frameIdx} 帧`,
    );
    writer.done();
    return { frameCount: frameIdx };
  } catch (error: unknown) {
    const failed = describeUpstreamError(error);
    console.error(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/real error:`,
      error,
    );
    writer.frame({ error: failed.message, upstreamStatus: failed.upstreamStatus });
    writer.done();
    return { frameCount: 0, failed };
  }
}
