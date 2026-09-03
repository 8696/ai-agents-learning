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

export function mountNoSignalRoutes(router: Router): void {
  router.post("/api/no-signal-abort", async (ctx: Context) => {
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
    const stats = await runNoSignalAbort({ llm, message: parsed.message, writer });
    console.log(
      `  POST /api/no-signal-abort  帧数=${stats.frameIdx}` +
        (stats.socketClosedEarly ? "  socket=5s已关" : "") +
        (stats.failed ? `  上游失败=${stats.failed.message}` : ""),
    );
  });
}
