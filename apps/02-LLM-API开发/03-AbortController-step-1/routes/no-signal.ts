/**
 * 职责：POST /api/no-signal-abort —— 故意不传 signal，5s 后关 SSE，SDK 仍跑完（薄封装）。
 * 数据流：{ message } → 闸门 → 开流 → runNoSignalAbort。
 * 为什么单独成文件：教学点是「忘了传 signal」；和带 signal 的 cancel 拆开，避免读者以为 abort 总有效。
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
    logger.info("route.no-signal.received", "POST /api/no-signal-abort", "反例路径端点入口（故意不传 signal）；记 messageLen + 闸门结果便于复盘", {
      messageLen: typeof (ctx.request.body as { message?: unknown })?.message === "string"
        ? ((ctx.request.body as { message: string }).message ?? "").length
        : 0,
    });

    ctx.respond = false;

    const parsed = parseAbortBody(ctx.request.body);
    if (!parsed.ok) {
      logger.warn("route.no-signal.bad-input", "请求体不合法 → 400", "闸门挡掉，反例路径之前也不让脏请求往下走", { reason: parsed.reason });
      writeRawJson(ctx.res, 400, { error: `请求体不合法：${parsed.reason}` });
      return;
    }

    if (!llm) {
      logger.error("route.no-signal.no-key", "LLM Key 未配置 → 503", "服务端兜底：apps/.env 没配当前 provider 的 Key，必须告诉用户怎么修", {});
      writeRawJson(ctx.res, 503, {
        error: "当前 LLM_PROVIDER 没有可用 Key：先在 apps/.env 配置后重启服务",
      });
      return;
    }

    logger.info("route.no-signal.start-stream", "开 SSE 流并交给 runNoSignalAbort", "闸门全过后接管 res，开 SSE；这条路径不会 abort SDK，5s 后只关 SSE socket", {
      messageLen: parsed.message.length,
    });
    const writer = openSseStream(ctx.res);
    const stats = await runNoSignalAbort({ llm, message: parsed.message, writer });
    console.log(
      `  POST /api/no-signal-abort  帧数=${stats.frameIdx}` +
        (stats.socketClosedEarly ? "  socket=5s已关" : "") +
        (stats.failed ? `  上游失败=${stats.failed.message}` : ""),
    );
    logger.info("route.no-signal.done", "/api/no-signal-abort 流程结束", "整条流程收尾；记帧数 + socket 是否 5s 提前关 + 失败信息 + 总耗时（含 SDK 跑完的时间）便于对照 cancel 的 usage", {
      frameIdx: stats.frameIdx,
      socketClosedEarly: stats.socketClosedEarly,
      failed: stats.failed ? stats.failed.message : null,
      elapsedMs: stats.elapsedMs,
    });
  });
}
