/**
 * 职责：POST /api/full 的业务流程 —— 不传 signal、不取消，把流跑到底（对照基线）。
 * 数据流：{ llm, message, writer } → 上游 stream:true（无 signal）→ delta 帧 → usage 帧 → [DONE]。
 * 为什么单独成文件：这是另外两个场景的对照尺。cancel / no-signal 改行为时不该碰这条「什么都不做」的路径。
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
  logger.info(
    "full.run.start",
    "进入 /api/full 主流程（对照基线）",
    "不传 signal、不 abort 的路径；记 model + 消息预览让回看时知道这是「什么都不做」的对照尺",
    {
      model: llm.modelA,
      messagePreview: message.slice(0, 80),
      messageLen: message.length,
    },
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
    logger.info(
      "full.run.complete",
      "流跑完（基线对照）",
      "完整跑完对照尺；记耗时 + 帧数 + usage 摘要，和 cancel/no-signal 对照看 token 消耗差异",
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
    return { frameIdx, usage, elapsedMs };
  } catch (err: unknown) {
    const failed = describeUpstreamError(err);
    console.error(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/full error:`,
      err,
    );
    logger.error(
      "full.run.fail",
      "上游 / 网络异常",
      "基线路径也不该 100% 成功；记 upstreamStatus + message 让排错时知道是哪条上游挂了",
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
      failed,
    };
  }
}
