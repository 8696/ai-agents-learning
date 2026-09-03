/**
 * 职责：POST /api/full 的业务流程 —— 不传 signal、不取消，把流跑到底（对照基线）。
 * 数据流：{ llm, message, writer } → 上游 stream:true（无 signal）→ delta 帧 → usage 帧 → [DONE]。
 * 为什么单独成文件：这是另外两个场景的对照尺。cancel / no-signal 改行为时不该碰这条「什么都不做」的路径。
 */
import { performance } from "node:perf_hooks";
import type { Llm } from "../../../../llm.js";
import type { SseWriter } from "../sse/sse-writer.js";
import {
  createChatStream,
  describeUpstreamError,
  readChunkFields,
} from "./stream-llm.js";

export type RunFullStats = {
  frameIdx: number;
  usage: unknown;
  elapsedMs: number;
  failed?: { message: string; upstreamStatus?: number };
};

/**
 * ① 建流时故意不传 signal：这条路径证明「不 abort 时长什么样」
 * ② 有 delta 才写帧：空 chunk（role / 空 delta）不计入教学对照的「可见帧」
 * ③ 流正常结束才发 usage + [DONE]：cancel 场景经常拿不到 usage，对照就靠这一条
 */
export async function runFull(params: {
  llm: Llm;
  message: string;
  writer: SseWriter;
}): Promise<RunFullStats> {
  const { llm, message, writer } = params;
  const t0 = performance.now();
  let frameIdx = 0;
  let usage: unknown = null;

  console.log(
    `\n[${(t0 / 1000).toFixed(2)}s] /api/full: messages.length=1, signal=无, 客户端不取消`,
  );

  try {
    const stream = await createChatStream(llm, message);

    for await (const chunk of stream) {
      frameIdx += 1;
      const fields = readChunkFields(chunk);
      if (fields.delta) {
        writer.frame({ event: "delta", frameIdx, content: fields.delta });
      }
      if (fields.usage) usage = fields.usage;
    }

    writer.frame({ event: "usage", frameIdx, usage });
    writer.done();

    const elapsedMs = Math.round(performance.now() - t0);
    const usageText =
      usage && typeof usage === "object" && "total_tokens" in usage
        ? `${(usage as { total_tokens: number }).total_tokens} tokens`
        : "未拿到";
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/full: ✅ 完成 | 耗时 ${elapsedMs}ms | 帧数 ${frameIdx} | usage ${usageText}`,
    );
    return { frameIdx, usage, elapsedMs };
  } catch (err: unknown) {
    const failed = describeUpstreamError(err);
    console.error(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/full error:`,
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
      failed,
    };
  }
}
