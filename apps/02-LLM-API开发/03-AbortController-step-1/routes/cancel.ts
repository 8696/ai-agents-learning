/**
 * 职责：POST /api/cancel-after-frames —— 带 AbortSignal，收 N 帧后 abort（薄封装）。
 * 数据流：{ message, abortAfterFrames } → 校验 → 开流 → runCancelAfterFrames。
 *   页面「立即取消」会掐 fetch → req.close → 同一条 AbortController.abort()。
 * 为什么单独成文件：这是唯一要把 ctx.req 交给 flow 的端点（监听客户端断开）。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostCancel 封装层）；
 *   校验挡下（400 / 503）单独写 warn / error（校验拒绝）；子调用 runCancelAfterFrames 内部已自带五条日志。
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
    ctx.respond = false;
    const tHandlerStart = Date.now();

    const parsed = parseAbortBody(ctx.request.body);
    if (!parsed.ok) {
      logger.warn(
        "api.cancel",
        "POST /api/cancel-after-frames 被入参校验挡掉",
        "为什么写这条日志：校验挡下没花模型额度也没走到 runCancelAfterFrames；记 reason 便于复盘。当前：body 不合法。",
        { endpoint: "POST /api/cancel-after-frames", reason: parsed.reason },
      );
      writeRawJson(ctx.res, 400, { error: `请求体不合法：${parsed.reason}` });
      return;
    }

    if (!llm) {
      logger.error(
        "api.cancel",
        "POST /api/cancel-after-frames 被无 Key 校验挡掉",
        "为什么写这条日志：服务端兜底；apps/.env 没配当前 provider 的 Key。当前：LLM 未配置。",
        { endpoint: "POST /api/cancel-after-frames" },
      );
      writeRawJson(ctx.res, 503, {
        error: "当前 LLM_PROVIDER 没有可用 Key：先在 apps/.env 配置后重启服务",
      });
      return;
    }

    logger.info(
      "api.cancel",
      "调用函数开始：handlePostCancel",
      "为什么写这条日志：route 只认这一层返回的 RunCancelStats；里面 runCancelAfterFrames 是真正干活的那一层（看「调用函数开始：runCancelAfterFrames」）。当前：校验全过、SSE 头已发；pagehide / 立即取消会触发 abort()。",
      {
        入参: { messageLen: parsed.message.length, abortAfterFrames: parsed.abortAfterFrames, messageLenRaw: typeof body.message === "string" ? body.message.length : 0 },
        __code: `const writer = openSseStream(ctx.res);\nconst stats = await runCancelAfterFrames({ llm, message: parsed.message, abortAfterFrames: parsed.abortAfterFrames, req: ctx.req, writer });`,
      },
    );

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

    if (stats.failed) {
      logger.error(
        "api.cancel",
        "调用函数结束：handlePostCancel（失败）",
        "为什么写这条日志：runCancelAfterFrames 失败已发 error 帧；记 frameIdx + aborted + abortReason + failed 便于和基线对照。当前：runCancelAfterFrames 已返回。",
        {
          返回值: { frameIdx: stats.frameIdx, aborted: stats.aborted, abortReason: stats.abortReason, failed: stats.failed, elapsedMs: stats.elapsedMs },
          耗时ms: Date.now() - tHandlerStart,
          错误: stats.failed,
        },
      );
    } else {
      logger.info(
        "api.cancel",
        "调用函数结束：handlePostCancel",
        "为什么写这条日志：route 要把 stats 写给客户端；记帧数 + abort 状态便于和基线对照。当前：runCancelAfterFrames 已返回。",
        {
          返回值: { frameIdx: stats.frameIdx, aborted: stats.aborted, abortReason: stats.abortReason, elapsedMs: stats.elapsedMs },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    }
  });
}