/**
 * 职责：POST /api/chat —— 协议 A 流式对话的 SSE 端点（薄封装：闸门 → 开流 → 交给 flow）。
 *
 * 数据流：
 *   { message } → parseChatBody → openSseStream → streamChatToSse → data: 帧… → data: [DONE]
 *   失败：参数错 400 / 没 Key 503（普通 JSON）；上游错 → 流里的错误帧
 *
 * 为什么单独成文件：这是本 Demo 唯一会花额度的端点，和 /health 的生命周期完全不同；
 * 真正的循环在 lib/flow/stream-chat.ts，这里只保证「顺序不能错」。
 */
import type { Context } from "koa";
import type Router from "@koa/router";
import { llm } from "../lib/http/runtime-ctx.js";
import { parseChatBody, writeRawJson } from "../lib/http/request-guards.js";
import { openSseStream } from "../lib/sse/sse-writer.js";
import { streamChatToSse } from "../lib/flow/stream-chat.js";
import { logger } from "../lib/logger.js";

export function mountChatRoutes(router: Router): void {
  router.post("/api/chat", async (ctx: Context) => {
    // ① 接管响应：SSE 要手写 res，koa 的 ctx.body 从这行起就不生效了（§5.3.5）
    ctx.respond = false;

    // ② 入参闸门必须排在开流之前：一旦发了 200 + text/event-stream 头，
    //    就再也改不回 400 了，页面只会收到一条「成功但是空」的流
    const parsed = parseChatBody(ctx.request.body);
    if (!parsed.ok) {
      writeRawJson(ctx.res, 400, { error: `请求体不合法：${parsed.reason}` });
      return;
    }

    // ③ 没 Key 也在开流前挡掉，回 503 而不是空流。
    //    页面其实早就从 /health 知道 Key ❌ 并禁用了按钮，这里是服务端兜底
    if (!llm) {
      writeRawJson(ctx.res, 503, {
        error: "当前 LLM_PROVIDER 没有可用 Key：先在 apps/.env 配置后重启服务",
      });
      return;
    }

    // ④ 到这里才发 SSE 响应头，之后所有信息（含上游报错）都只能以帧的形式传
    const writer = openSseStream(ctx.res);
    const stats = await streamChatToSse({ llm, message: parsed.message, writer });

    // 终端日志和页面看到的是同一份统计，方便对着核对帧数
    logger.info(
      "api.chat",
      "POST /api/chat 流式对话结束",
      "汇总本次请求的结果：帧数、Token 用量、是否上游失败 —— 跟页面 stats 区对着看就是一份核对清单",
      {
        endpoint: "POST /api/chat",
        frameCount: stats.frameCount,
        usage: stats.usage,
        failed: stats.failed,
        __code: `// routes/chat.ts ctx.respond=false → openSseStream → streamChatToSse → writer.done()`,
      },
    );
    console.log(
      `  POST /api/chat  帧数=${stats.frameCount}` +
        (stats.usage ? `  total_tokens=${stats.usage.total_tokens}` : "  usage=无") +
        (stats.failed ? `  上游失败=${stats.failed.message}` : ""),
    );
  });
}
