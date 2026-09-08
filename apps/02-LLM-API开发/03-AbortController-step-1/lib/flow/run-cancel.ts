/**
 * 职责：POST /api/cancel-after-frames 的业务流程 —— 带 AbortSignal，收 N 帧后 abort。
 * 数据流：
 *   { llm, message, abortAfterFrames, req, writer }
 *     → create({ signal })
 *     → 第 N 帧 controller.abort()，或 req.close / 客户端 abort fetch 也 abort
 *     → AbortError → 发 aborted 帧（reason / frameIdx / usage）
 * 为什么单独成文件：这是唯一「signal 真生效」的路径；和 no-signal 对照才能讲清「客户端停 ≠ 服务端停」。
 *
 * 日志（§5.3.16）：调用函数 五件套（runCancelAfterFrames 封装层）；
 *   流式规则（§5.3.16）：只在收尾打一次完整返回值，中间 abort 触发点单条 warn（不套五件套）。
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
  const tFuncStart = Date.now();
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
        "││ cancel-runCancelAfterFrames",
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
    "│ cancel-runCancelAfterFrames",
    "调用函数开始：runCancelAfterFrames",
    "为什么打：route 只认这一层返回的 RunCancelStats；里面 createChatStream 是「真活」（看「调用模型开始：对话补全」）。当前：带 signal 的 cancel 即将开始；abortAfterFrames 控制「收几帧才 abort」。",
    {
      入参: { model: llm.modelA, messagePreview: message.slice(0, 80), messageLen: message.length, targetFrames, hasReq: true },
      __code: `const controller = new AbortController();\nreq.on("close", () => controller.abort());\nconst stream = await createChatStream(llm, message, controller.signal);`,
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
          "││ cancel-runCancelAfterFrames",
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
      "│ cancel-runCancelAfterFrames",
      "调用函数结束：runCancelAfterFrames",
      "为什么打：route 要把 RunCancelStats 写进 ctx.body（或日志）便于和基线对照帧数 / abort 状态。当前：流跑完、N 太大没触发 abort（或 abort 后 SDK 仍把剩余 chunk 吐完）。",
      {
        返回值: {
          frameIdx,
          aborted: false,
          abortReason: null,
          usageSummary: usage && typeof usage === "object" && "total_tokens" in usage
            ? {
                prompt_tokens: (usage as { prompt_tokens?: number }).prompt_tokens,
                completion_tokens: (usage as { completion_tokens?: number }).completion_tokens,
                total_tokens: (usage as { total_tokens?: number }).total_tokens,
              }
            : null,
        },
        耗时ms: Date.now() - tFuncStart,
      },
    );
    return { frameIdx, usage, elapsedMs, aborted: false, abortReason: null };
  } catch (err: unknown) {
    const elapsedMs = Math.round(performance.now() - t0);

    if (isAbortError(err)) {
      logger.info(
        "│ cancel-runCancelAfterFrames",
        "调用函数结束：runCancelAfterFrames",
        "为什么打：AbortError 不算错误而是教学结果；记 abortReason + 收了 N 帧 + usage 拿到没拿到。当前：abort() 真的传到 SDK 了，已发 aborted 帧。",
        {
          返回值: {
            frameIdx,
            aborted: true,
            abortReason,
            usageCaptured: usage !== null,
            elapsedMs,
          },
          耗时ms: Date.now() - tFuncStart,
          字段释义: {
            abortReason: "frames=服务端收满 N 帧 / client-close=浏览器掐 fetch / manual=其它",
            usageCaptured: "abort 后 SDK 是否把 usage 块仍吐出来了（要看是否拿到完整 usage）",
          },
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
      "│ cancel-runCancelAfterFrames",
      "调用函数结束：runCancelAfterFrames（失败）",
      "为什么打：非 abort 类的上游失败（401 / 429 / 5xx / 网络断）；记 upstreamStatus + message 让排错时知道是 abort 路径还是真挂了。当前：抛非 AbortError，已发 error 帧。",
      {
        返回值: {
          frameIdx,
          aborted: false,
          abortReason: null,
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
      elapsedMs,
      aborted: false,
      abortReason: null,
      failed,
    };
  }
}