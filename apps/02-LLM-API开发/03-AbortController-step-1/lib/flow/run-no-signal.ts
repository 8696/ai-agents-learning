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
import { logger } from "../logger.js";
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
      logger.warn(
        "no-signal.socket-close",
        "5s 到 → 强制 closeSocket() 关 SSE",
        "教学反例路径：5s 只关 SSE socket、不碰上游；记 socket 关掉时机便于和 SDK 跑完时机对照",
        {
          elapsedMs: Math.round(performance.now() - t0),
          socketClosedEarly: true,
        },
      );
      writer.closeSocket();
    }
  }, 5000);

  console.log(
    `\n[${(t0 / 1000).toFixed(2)}s] /api/no-signal-abort: signal=故意不传，5s 后 closeSocket() 模拟客户端关连接`,
  );
  logger.info(
    "no-signal.run.start",
    "进入 /api/no-signal-abort 主流程（反例路径）",
    "故意不传 signal 的反例；记下「5s 后只关 SSE socket、不通知 SDK」这条关键约束让回看时知道为什么这条路径仍在扣费",
    {
      model: llm.modelA,
      messagePreview: message.slice(0, 80),
      messageLen: message.length,
      closeSocketAtMs: 5000,
    },
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
          logger.info(
            "no-signal.write-fail",
            "第 N 帧 res.write 失败（socket 已关）",
            "socket 关了 res.write 失败，但**不 break**；继续从 SDK 拉 chunk 是为了拿到 usage；记下当前帧号便于对照 socket 关掉的时机",
            {
              frameIdx,
              elapsedMs: Math.round(performance.now() - t0),
            },
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
    logger.warn(
      "no-signal.run.complete",
      "SDK 跑完，token 已生成（教学核心反例）",
      "教学点：socket 关了 ≠ 上游停；SDK 跑完时已生成的 token 都计入 usage，对照 cancel/no-signal 的 usage 数就能看钱照算；记 socket 关掉时机便于复盘",
      {
        elapsedMs,
        frameIdx,
        socketClosedEarly,
        elapsedAtSocketCloseMs: socketClosedEarly ? 5000 : null,
        usageSummary: usage && typeof usage === "object" && "total_tokens" in usage
          ? {
              prompt_tokens: (usage as { prompt_tokens?: number }).prompt_tokens,
              completion_tokens: (usage as { completion_tokens?: number }).completion_tokens,
              total_tokens: (usage as { total_tokens?: number }).total_tokens,
            }
          : null,
      },
    );
    return { frameIdx, usage, elapsedMs, socketClosedEarly };
  } catch (err: unknown) {
    clearTimeout(closeTimer);
    const failed = describeUpstreamError(err);
    console.error(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/no-signal-abort error:`,
      err,
    );
    logger.error(
      "no-signal.run.fail",
      "上游 / 网络异常（反例路径）",
      "反例路径下 SDK 抛错；记 upstreamStatus + message 让排错时区分是 abort 没生效还是真挂了",
      {
        upstreamStatus: failed.upstreamStatus ?? null,
        message: failed.message,
        errName: err instanceof Error ? err.name : String(err),
        frameIdx,
        elapsedMs: Math.round(performance.now() - t0),
      },
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
