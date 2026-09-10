/**
 * 职责：POST /api/full 的业务流程 —— 不传 signal、不取消，把流跑到底（对照基线）。
 * 数据流：{ llm, message, writer } → 上游 stream:true（无 signal）→ delta 帧 → usage 帧 → [DONE]。
 * 为什么单独成文件：这是另外两个场景的对照尺。cancel / no-signal 改行为时不该碰这条「什么都不做」的路径。
 *
 * 日志（§5.3.16）：调用函数 五条日志（runFull 封装层）；
 *   流式规则（§5.3.16）：只在收尾写一次完整返回值，中间 chunk 不套五条日志。
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
  const tFuncStart = Date.now();
  let frameIdx = 0;
  let usage: unknown = null;

  logger.info(
    "│ 基线-runFull",
    "调用函数开始：runFull",
    "为什么写这条日志：route 只认这一层返回的 RunFullStats；里面 createChatStream 是真正干活的那一层（看「调用模型开始：对话补全」）。当前：即将发不传 signal 的对照基线调用。",
    {
      入参: { model: llm.modelA, messagePreview: message.slice(0, 80), messageLen: message.length },
      __code: `const stream = await createChatStream(llm, message);\nfor await (const chunk of stream) { writer.frame({ event: "delta", frameIdx, content: ... }); }`,
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
    // 流式规则（§5.3.16）：完整拼好的返回值 = 最后给页面的 stats。
    logger.info(
    "│ 基线-runFull",
    "调用函数结束：runFull",
    "为什么写这条日志：route 要把 RunFullStats 写进 ctx.body（或日志）便于和 cancel/no-signal 对照帧数 / usage。当前：流跑完、usage 已拿到。",
    {
      返回值: {
        frameIdx,
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
    },
  );
    console.log(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/full: ✅ 完成 | 耗时 ${elapsedMs}ms | 帧数 ${frameIdx} | usage ${usage && typeof usage === "object" && "total_tokens" in usage ? `${(usage as { total_tokens: number }).total_tokens} tokens` : "未拿到"}`,
    );
    return { frameIdx, usage, elapsedMs };
  } catch (err: unknown) {
    const failed = describeUpstreamError(err);
    console.error(
      `[${(performance.now() / 1000).toFixed(2)}s] /api/full error:`,
      err,
    );
    logger.error(
      "│ 基线-runFull",
      "调用函数结束：runFull（失败）",
      "为什么写这条日志：基线路径也不该 100% 成功；记 upstreamStatus + message 让排错时知道是哪条上游挂了。当前：createChatStream 抛错（非 abort 类），已发 error 帧。",
      {
        返回值: {
          frameIdx,
          failed,
          error: err instanceof Error ? err.message : String(err),
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
      failed,
    };
  }
}