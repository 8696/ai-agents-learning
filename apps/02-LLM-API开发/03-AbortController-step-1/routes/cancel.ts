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

export function mountCancelRoutes(router: Router): void {
  router.post("/api/cancel-after-frames", async (ctx: Context) => {
    ctx.respond = false;

    const parsed = parseAbortBody(ctx.request.body);
    if (!parsed.ok) {
      writeRawJson(ctx.res, 400, { error: `请求体不合法：${parsed.reason}` });
      return;
    }

    if (!llm) {
      writeRawJson(ctx.res, 503, {
        error: "当前 LLM_PROVIDER 没有可用 Key：先在 apps/.env 配置后重启服务",
      });
      return;
    }

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
  });
}
