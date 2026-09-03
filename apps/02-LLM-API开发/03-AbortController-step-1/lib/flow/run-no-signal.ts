/**
 * 职责：POST /api/no-signal-abort 的业务流程 —— 故意不传 signal，abort 不生效，SDK 仍跑完。
 * 数据流：
 *   { llm, message, writer }
 *     → create（无 signal）
 *     → 5s 后 writer.closeSocket() 模拟客户端关连接
 *     → write 失败照样 for await，直到上游自己结束
 *     → 终端打 usage：已生成的 token 仍计费
 * 为什么单独成文件：这是「忘了传 signal 会长什么样」的反例，必须和带 signal 的 cancel 分开，
 *   混在一个 if 里读者会以为 abort 总是有效。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { SseWriter } from "../sse/sse-writer.js";
import {
  createChatStream,
  describeUpstreamError,
  readChunkFields,
} from "./stream-llm.js";

export type RunNoSignalStats = {
  frameIdx: number;
  usage: unknown;
  elapsedMs: number;
  socketClosedEarly: boolean;
  failed?: { message: string; upstreamStatus?: number };
};

/**
 * ① 故意不传 signal：controller.abort() / 客户端断开都通知不到 SDK
 * ② 5s 后只关 SSE socket，不碰上游：页面读循环结束，但生成还在继续
 * ③ write 失败不要 break：教学点就是「客户端停了、服务端还在跑、钱还在扣」
 * ④ 循环结束后 usage 仍然在 —— 已生成 token 照计入账单
 */
export async function runNoSignalAbort(params: {
  llm: Llm;
  message: string;
  writer: SseWriter;
}): Promise<RunNoSignalStats> {
  const { llm, message, writer } = params;
  const t0 = performance.now();
  let frameIdx = 0;
  let usage: unknown = null;
  let socketClosedEarly = false;

  const closeTimer = setTimeout(() => {
    if (!writer.isClosed()) {
      socketClosedEarly = true;
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/no-signal-abort: 5s 到 → 强制 closeSocket() 关 SSE（**没传 signal，SDK 继续跑**）`,
      );
      writer.closeSocket();
    }
  }, 5000);

  console.log(
    `\n[${(t0 / 1000).toFixed(2)}s] /api/no-signal-abort: signal=故意不传，5s 后 closeSocket() 模拟客户端关连接`,
  );

  try {
    const stream = await createChatStream(llm, message);

    for await (const chunk of stream) {
      frameIdx += 1;
      const fields = readChunkFields(chunk);
      // ① 这里不因 isClosed() 而 break：socket 没了也要把上游拉完，才能拿到 usage
      if (fields.delta) {
        const wrote = writer.frame({
          event: "delta",
          frameIdx,
          content: fields.delta,
        });
        if (!wrote) {
          console.log(
            `[${(performance.now() / 1000).toFixed(2)}s] /api/no-signal-abort: 第 ${frameIdx} 帧 res.write 失败（socket 已关）→ SDK 仍在跑`,
          );
        }
      }
      if (fields.usage) usage = fields.usage;
    }

    clearTimeout(closeTimer);

    if (!writer.isClosed()) {
      writer.frame({ event: "usage", frameIdx, usage });
      writer.done();
    }

    const elapsedMs = Math.round(performance.now() - t0);
    const usageText =
      usage && typeof usage === "object" && "total_tokens" in usage
        ? `${(usage as { total_tokens: number }).total_tokens} tokens`
        : "未拿到";
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/no-signal-abort: SDK 跑完 | 耗时 ${elapsedMs}ms | 共 ${frameIdx} 帧 | usage ${usageText}`,
    );
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/no-signal-abort: ⚠️ 即使客户端 socket 已关，SDK 已生成的 token 都计入 usage，钱照算`,
    );
    return { frameIdx, usage, elapsedMs, socketClosedEarly };
  } catch (err: unknown) {
    clearTimeout(closeTimer);
    const failed = describeUpstreamError(err);
    console.error(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/no-signal-abort error:`,
      err,
    );
    writer.frame({
      event: "error",
      message: failed.message,
      frameIdx,
      upstreamStatus: failed.upstreamStatus ?? null,
    });
    writer.done();
    return {
      frameIdx,
      usage,
      elapsedMs: Math.round(performance.now() - t0),
      socketClosedEarly,
      failed,
    };
  }
}
