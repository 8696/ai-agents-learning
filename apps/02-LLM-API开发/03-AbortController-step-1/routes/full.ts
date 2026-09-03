/**
 * 职责：POST /api/full —— 不取消、跑到底的 SSE 端点（薄：闸门 → 开流 → 交给 flow）。
 * 数据流：{ message } → parseAbortBody → openSseStream → runFull → delta… → usage → [DONE]。
 * 失败：参数错 400 / 没 Key 503（普通 JSON）；上游错 → 流里的 error 帧。
 * 为什么单独成文件：这是对照基线，和 cancel / no-signal 的生命周期不同，互不 import。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm } from "../lib/http/runtime-ctx.js";
import { parseAbortBody, writeRawJson } from "../lib/http/request-guards.js";
import { openSseStream } from "../lib/sse/sse-writer.js";
import { runFull } from "../lib/flow/run-full.js";

export function mountFullRoutes(router: Router): void {
  router.post("/api/full", async (ctx: Context) => {
    // ① 接管响应：SSE 要手写 res，koa 的 ctx.body 从这行起就不生效了（§5.3.5）
    ctx.respond = false;

    // ② 入参闸门必须排在开流之前：一旦发了 200 + text/event-stream 头，就再也改不回 400
    const parsed = parseAbortBody(ctx.request.body);
    if (!parsed.ok) {
      writeRawJson(ctx.res, 400, { error: `请求体不合法：${parsed.reason}` });
      return;
    }

    // ③ 没 Key 也在开流前挡掉。页面其实早就从 /health 知道 Key ❌ 并禁用了按钮，这里是服务端兜底
    if (!llm) {
      writeRawJson(ctx.res, 503, {
        error: "当前 LLM_PROVIDER 没有可用 Key：先在 apps/.env 配置后重启服务",
      });
      return;
    }

    const writer = openSseStream(ctx.res);
    const stats = await runFull({ llm, message: parsed.message, writer });
    console.log(
      `  POST /api/full  帧数=${stats.frameIdx}` +
        (stats.failed ? `  上游失败=${stats.failed.message}` : ""),
    );
  });
}
