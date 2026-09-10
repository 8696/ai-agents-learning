/**
 * 职责：POST /api/no-signal-abort —— 故意不传 signal，5s 后关 SSE，SDK 仍跑完（薄封装）。
 * 数据流：{ message } → 校验 → 开流 → runNoSignalAbort。
 * 为什么单独成文件：教学点是「忘了传 signal」；和带 signal 的 cancel 拆开，避免读者以为 abort 总有效。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostNoSignal 封装层）；
 *   校验挡下（400 / 503）单独写 warn / error（校验拒绝）；子调用 runNoSignalAbort 内部已自带五条日志。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm } from "../lib/http/runtime-ctx.js";
import { parseAbortBody, writeRawJson } from "../lib/http/request-guards.js";
import { openSseStream } from "../lib/sse/sse-writer.js";
import { runNoSignalAbort } from "../lib/flow/run-no-signal.js";
import { logger } from "../lib/logger.js";

export function mountNoSignalRoutes(router: Router): void {
  router.post("/api/no-signal-abort", async (ctx: Context) => {
    ctx.respond = false;
    const tHandlerStart = Date.now();

    const parsed = parseAbortBody(ctx.request.body);
    if (!parsed.ok) {
      logger.warn(
        "api.no-signal",
        "POST /api/no-signal-abort 被入参校验挡掉",
        "为什么写这条日志：校验挡下没花模型额度也没走到 runNoSignalAbort；记 reason 便于复盘。当前：body 不合法。",
        { endpoint: "POST /api/no-signal-abort", reason: parsed.reason },
      );
      writeRawJson(ctx.res, 400, { error: `请求体不合法：${parsed.reason}` });
      return;
    }

    if (!llm) {
      logger.error(
        "api.no-signal",
        "POST /api/no-signal-abort 被无 Key 校验挡掉",
        "为什么写这条日志：服务端兜底；apps/.env 没配当前 provider 的 Key。当前：LLM 未配置。",
        { endpoint: "POST /api/no-signal-abort" },
      );
      writeRawJson(ctx.res, 503, {
        error: "当前 LLM_PROVIDER 没有可用 Key：先在 apps/.env 配置后重启服务",
      });
      return;
    }

    logger.info(
      "api.no-signal",
      "调用函数开始：handlePostNoSignal",
      "为什么写这条日志：route 只认这一层返回的 RunNoSignalStats；里面 runNoSignalAbort 是真正干活的那一层（看「调用函数开始：runNoSignalAbort」）。当前：校验全过、SSE 头已发；这条路径不会 abort SDK，5s 后只关 SSE socket。",
      {
        入参: { messageLen: parsed.message.length },
        __code: `const writer = openSseStream(ctx.res);\nconst stats = await runNoSignalAbort({ llm, message: parsed.message, writer });`,
      },
    );

    const writer = openSseStream(ctx.res);
    const stats = await runNoSignalAbort({ llm, message: parsed.message, writer });
    console.log(
      `  POST /api/no-signal-abort  帧数=${stats.frameIdx}` +
        (stats.socketClosedEarly ? "  socket=5s已关" : "") +
        (stats.failed ? `  上游失败=${stats.failed.message}` : ""),
    );

    if (stats.failed) {
      logger.error(
        "api.no-signal",
        "调用函数结束：handlePostNoSignal（失败）",
        "为什么写这条日志：runNoSignalAbort 失败已发 error 帧；记 frameIdx + socket 状态 + failed 便于对照 cancel 的 usage 差异。当前：runNoSignalAbort 已返回。",
        {
          返回值: { frameIdx: stats.frameIdx, socketClosedEarly: stats.socketClosedEarly, failed: stats.failed, elapsedMs: stats.elapsedMs },
          耗时ms: Date.now() - tHandlerStart,
          错误: stats.failed,
        },
      );
    } else {
      logger.info(
        "api.no-signal",
        "调用函数结束：handlePostNoSignal",
        "为什么写这条日志：route 要把 stats 写给客户端；记帧数 + socket 状态 + 耗时（含 SDK 跑完的时间）便于对照 cancel 的 usage 差异。当前：runNoSignalAbort 已返回。",
        {
          返回值: { frameIdx: stats.frameIdx, socketClosedEarly: stats.socketClosedEarly, elapsedMs: stats.elapsedMs },
          耗时ms: Date.now() - tHandlerStart,
        },
      );
    }
  });
}