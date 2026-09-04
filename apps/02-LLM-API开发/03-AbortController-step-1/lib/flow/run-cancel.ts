/**
 * 职责：POST /api/cancel-after-frames 的业务流程 —— 带 AbortSignal，收 N 帧后 abort。
 * 数据流：
 *   { llm, message, abortAfterFrames, req, writer }
 *     → create({ signal })
 *     → 第 N 帧 controller.abort()，或 req.close / 客户端 abort fetch 也 abort
 *     → AbortError → 发 aborted 帧（reason / frameIdx / usage）
 * 为什么单独成文件：这是唯一「signal 真生效」的路径；和 no-signal 对照才能讲清「客户端停 ≠ 服务端停」。
 */
import type { IncomingMessage } from "node:http";
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { SseWriter } from "../sse/sse-writer.js";
import { logger } from "../logger.js";
import {
  createChatStream,
  describeUpstreamError,
  isAbortError,
  readChunkFields,
  type AbortReason,
} from "./stream-llm.js";

export type RunCancelStats = {
  frameIdx: number;
  usage: unknown;
  elapsedMs: number;
  aborted: boolean;
  abortReason: AbortReason | null;
  failed?: { message: string; upstreamStatus?: number };
};

/**
 * ① 先 new AbortController，再把 signal 传进 SDK：没这一步，后面 abort() 只是空操作
 * ② req.close → abort：页面点「立即取消」/ 关标签 = 浏览器掐 fetch = TCP 断开 = 这条监听
 * ③ 收满 N 帧再 abort：服务端自己停，客户端能收到 aborted 帧（和「立即取消」对得上）
 * ④ AbortError 当成成功教学结果写 aborted 帧，不要当成 500
 */
export async function runCancelAfterFrames(params: {
  llm: Llm;
  message: string;
  abortAfterFrames: number;
  req: IncomingMessage;
  writer: SseWriter;
}): Promise<RunCancelStats> {
  const { llm, message, abortAfterFrames, req, writer } = params;
  const t0 = performance.now();
  let frameIdx = 0;
  let aborted = false;
  let abortReason: AbortReason = "frames";
  let usage: unknown = null;

  const controller = new AbortController();
  const targetFrames = abortAfterFrames;

  req.on("close", () => {
    if (!aborted) {
      aborted = true;
      abortReason = "client-close";
      logger.warn(
        "llm.abort",
        "客户端断开触发 abort()",
        "浏览器掐 fetch（立即取消 / pagehide / 网络断）→ TCP 断开 → req.close → 走 AbortController；记下当时已收帧数 + targetFrames 便于对照 abort 触发时机",
        {
          reason: "client-close",
          frameIdxSoFar: frameIdx,
          targetFrames,
          elapsedMs: Math.round(performance.now() - t0),
        },
      );
      controller.abort();
    }
  });

  logger.info(
    "cancel.run.start",
    "进入 /api/cancel-after-frames 主流程",
    "带 signal 的对照路径；记 abortAfterFrames 让回看时知道「收几帧才 abort」",
    {
      abortAfterFrames: targetFrames,
      model: llm.modelA,
      messagePreview: message.slice(0, 80),
      messageLen: message.length,
    },
  );

  try {
    const stream = await createChatStream(llm, message, controller.signal);

    for await (const chunk of stream) {
      frameIdx += 1;
      const fields = readChunkFields(chunk);
      if (fields.delta) {
        writer.frame({ event: "delta", frameIdx, content: fields.delta });
      }
      if (fields.usage) usage = fields.usage;

      if (frameIdx >= targetFrames && !aborted) {
        aborted = true;
        abortReason = "frames";
        logger.warn(
          "llm.abort",
          "收满 N 帧触发 abort()",
          "服务端自己到帧就停（和「客户端立即取消」对照）；记下最后收的帧 + targetFrames 便于核对 abort 触发条件",
          {
            reason: "frames",
            frameIdx,
            targetFrames,
            elapsedMs: Math.round(performance.now() - t0),
          },
        );
        controller.abort();
      }
    }

    // 正常跑完（N 太大没触发 abort，或 abort 后 SDK 仍把剩余 chunk 吐完）
    writer.frame({ event: "usage", frameIdx, usage });
    writer.done();

    const elapsedMs = Math.round(performance.now() - t0);
    logger.info(
      "cancel.run.complete",
      "流跑完（未触发 abort）",
      "N 设得太大 / abort 之前 SDK 已吐完所有 chunk；记耗时 + 帧数 + usage 摘要便于核对",
      {
        elapsedMs,
        frameIdx,
        usageSummary: usage && typeof usage === "object" && "total_tokens" in usage
          ? {
              prompt_tokens: (usage as { prompt_tokens?: number }).prompt_tokens,
              completion_tokens: (usage as { completion_tokens?: number }).completion_tokens,
              total_tokens: (usage as { total_tokens?: number }).total_tokens,
            }
          : null,
      },
    );
    return { frameIdx, usage, elapsedMs, aborted: false, abortReason: null };
  } catch (err: unknown) {
    const elapsedMs = Math.round(performance.now() - t0);

    if (isAbortError(err)) {
      logger.info(
        "llm.abort",
        "AbortError caught（教学预期）",
        "abort() 真的传到 SDK 了；这不算错误而是教学结果，记 abortReason + 收了 N 帧 + usage 拿到没拿到",
        {
          reason: abortReason,
          frameIdx,
          elapsedMs,
          usageCaptured: usage !== null,
          errName: err instanceof Error ? err.name : String(err),
          errMessage: err instanceof Error ? err.message : String(err),
        },
      );
      writer.frame({
        event: "aborted",
        reason: abortReason,
        frameIdx,
        elapsedMs,
        usage,
      });
      writer.done();
      return { frameIdx, usage, elapsedMs, aborted: true, abortReason };
    }

    const failed = describeUpstreamError(err);
    logger.error(
      "cancel.run.fail",
      "上游 / 网络异常（非 abort）",
      "非 abort 类的上游失败（401 / 429 / 5xx / 网络断）；记 upstreamStatus + message 让排错时知道是 abort 路径还是真挂了",
      {
        upstreamStatus: failed.upstreamStatus ?? null,
        message: failed.message,
        errName: err instanceof Error ? err.name : String(err),
        elapsedMs,
        frameIdx,
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
      elapsedMs,
      aborted: false,
      abortReason: null,
      failed,
    };
  }
}
