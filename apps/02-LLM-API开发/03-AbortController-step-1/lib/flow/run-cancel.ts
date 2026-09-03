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
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/cancel-after-frames: 客户端断开（立即取消 / pagehide / 网络断）→ controller.abort()`,
      );
      controller.abort();
    }
  });

  console.log(
    `\n[${(t0 / 1000).toFixed(2)}s] /api/cancel-after-frames: signal=有, abortAfterFrames=${targetFrames}`,
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
        console.log(
          `[${(performance.now() / 1000).toFixed(2)}s] /api/cancel-after-frames: 已收 ${frameIdx} 帧 → controller.abort()（abortAfterFrames=${targetFrames}）`,
        );
        controller.abort();
      }
    }

    // 正常跑完（N 太大没触发 abort，或 abort 后 SDK 仍把剩余 chunk 吐完）
    writer.frame({ event: "usage", frameIdx, usage });
    writer.done();

    const elapsedMs = Math.round(performance.now() - t0);
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/cancel-after-frames: ✅ 流跑完 | 耗时 ${elapsedMs}ms | 帧数 ${frameIdx}`,
    );
    return { frameIdx, usage, elapsedMs, aborted: false, abortReason: null };
  } catch (err: unknown) {
    const elapsedMs = Math.round(performance.now() - t0);

    if (isAbortError(err)) {
      console.log(
        `[${(performance.now() / 1000).toFixed(2)}s] /api/cancel-after-frames: 🛑 AbortError caught | 写了 ${frameIdx} 帧 | 耗时 ${elapsedMs}ms | usage ${usage ? "已记录" : "未拿到（流提前结束）"}`,
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
    console.error(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/cancel-after-frames error:`,
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
      elapsedMs,
      aborted: false,
      abortReason: null,
      failed,
    };
  }
}
