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
 *
 * 日志（§5.3.16）：调用函数 五件套（runNoSignalAbort 封装层）；
 *   流式规则（§5.3.16）：只在收尾打一次完整返回值，中间 socket-close / write-fail 单条 warn / info。
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
  llm: Llm,
  message: string,
  writer: SseWriter;
}): Promise<RunNoSignalStats> {
  const { llm, message, writer } = params;
  const t0 = performance.now();
  const tFuncStart = Date.now();
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
        "││ no-signal-runNoSignalAbort",
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

  logger.info(
    "│ no-signal-runNoSignalAbort",
    "调用函数开始：runNoSignalAbort",
    "为什么打：route 只认这一层返回的 RunNoSignalStats；里面 createChatStream 是「真活」（看「调用模型开始：对话补全」）。当前：故意不传 signal 的反例即将开始；5s 后只关 SSE socket、不通知 SDK。",
    {
      入参: { model: llm.modelA, messagePreview: message.slice(0, 80), messageLen: message.length, closeSocketAtMs: 5000 },
      __code: `const closeTimer = setTimeout(() => writer.closeSocket(), 5000);\nconst stream = await createChatStream(llm, message); // 无 signal`,
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
            "││ no-signal-runNoSignalAbort",
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
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/no-signal-abort: SDK 跑完 | 耗时 ${elapsedMs}ms | 共 ${frameIdx} 帧 | usage ${usage && typeof usage === "object" && "total_tokens" in usage ? `${(usage as { total_tokens: number }).total_tokens} tokens` : "未拿到"}`,
    );
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/no-signal-abort: ⚠️ 即使客户端 socket 已关，SDK 已生成的 token 都计入 usage，钱照算`,
    );
    // 流式规则（§5.3.16）：完整拼好的返回值 = 最后给页面的 stats。
    logger.warn(
      "│ no-signal-runNoSignalAbort",
      "调用函数结束：runNoSignalAbort",
      "教学点：socket 关了 ≠ 上游停；SDK 跑完时已生成的 token 都计入 usage，对照 cancel/no-signal 的 usage 数就能看钱照算；记 socket 关掉时机便于复盘",
      {
        返回值: {
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
          failed: undefined,
        },
        耗时ms: Date.now() - tFuncStart,
        字段释义: {
          socketClosedEarly: "5s 是否关掉了 SSE socket（关掉但 SDK 仍在跑）",
          elapsedAtSocketCloseMs: "socket 关掉时点（用于对照 SDK 跑完时点）",
        },
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
      "│ no-signal-runNoSignalAbort",
      "调用函数结束：runNoSignalAbort（失败）",
      "为什么打：反例路径下 SDK 抛错；记 upstreamStatus + message 让排错时区分是 abort 没生效还是真挂了。当前：抛错，已发 error 帧。",
      {
        返回值: {
          frameIdx,
          socketClosedEarly,
          failed,
        },
        耗时ms: Date.now() - tFuncStart,
        错误: err,
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