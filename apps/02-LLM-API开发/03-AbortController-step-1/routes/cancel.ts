/**
 * 职责：POST /api/cancel-after-frames —— 带 AbortSignal，收 N 帧后 abort（薄封装）。
 * 数据流：{ message, abortAfterFrames } → 闸门 → 开流 → runCancelAfterFrames。
 *   页面「立即取消」会掐 fetch → req.close → 同一条 AbortController.abort()。
 * 为什么单独成文件：这是唯一要把 ctx.req 交给 flow 的端点（监听客户端断开）。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm } from "../lib/http/runtime-ctx.js";
import { parseAbortBody, writeRawJson } from "../lib/http/request-guards.js";
import { openSseStream } from "../lib/sse/sse-writer.js";
import { runCancelAfterFrames } from "../lib/flow/run-cancel.js";
import { logger } from "../lib/logger.js";

export function mountCancelRoutes(router: Router): void {
  router.post("/api/cancel-after-frames", async (ctx: Context) => {
    const body = (ctx.request.body ?? {}) as { message?: unknown; abortAfterFrames?: unknown };
    logger.info("route.cancel.received", "POST /api/cancel-after-frames", "带 signal 的 cancel 端点入口；记 messageLen + abortAfterFrames + 闸门结果便于复盘", {
      messageLen: typeof body.message === "string" ? body.message.length : 0,
      abortAfterFrames: typeof body.abortAfterFrames === "number" ? body.abortAfterFrames : null,
    });

    ctx.respond = false;

    const parsed = parseAbortBody(ctx.request.body);
    if (!parsed.ok) {
      logger.warn("route.cancel.bad-input", "请求体不合法 → 400", "闸门挡掉，cancel 之前不让脏请求往下走", { reason: parsed.reason });
      writeRawJson(ctx.res, 400, { error: `请求体不合法：${parsed.reason}` });
      return;
    }

    if (!llm) {
      logger.error("route.cancel.no-key", "LLM Key 未配置 → 503", "服务端兜底：apps/.env 没配当前 provider 的 Key，必须告诉用户怎么修", {});
      writeRawJson(ctx.res, 503, {
        error: "当前 LLM_PROVIDER 没有可用 Key：先在 apps/.env 配置后重启服务",
      });
      return;
    }

    logger.info("route.cancel.start-stream", "开 SSE 流并交给 runCancelAfterFrames", "闸门全过后接管 res，开 SSE，把控制权交给 flow；pagehide / 立即取消会触发 abort()", {
      messageLen: parsed.message.length,
      abortAfterFrames: parsed.abortAfterFrames,
    });
    const writer = openSseStream(ctx.res);
    const stats = await runCancelAfterFrames({
      llm,
      message: parsed.message,
      abortAfterFrames: parsed.abortAfterFrames,
      req: ctx.req,
      writer,
    });
    console.log(
      `  POST /api/cancel-after-frames  帧数=${stats.frameIdx}` +
        (stats.aborted ? `  aborted=${stats.abortReason}` : "") +
        (stats.failed ? `  上游失败=${stats.failed.message}` : ""),
    );
    logger.info("route.cancel.done", "/api/cancel-after-frames 流程结束", "整条流程收尾；记帧数 + abort 状态 + 失败信息便于和基线对照", {
      frameIdx: stats.frameIdx,
      aborted: stats.aborted,
      abortReason: stats.abortReason,
      failed: stats.failed ? stats.failed.message : null,
      elapsedMs: stats.elapsedMs,
    });
  });
}
