/**
 * 职责：POST /api/chat —— 协议 A 流式对话的 SSE 端点（薄封装：校验 → 开流 → 交给 flow）。
 *
 * 数据流：
 *   { message } → parseChatBody → openSseStream → streamChatToSse → data: 帧… → data: [DONE]
 *   失败：参数错 400 / 没 Key 503（普通 JSON）；上游错 → 流里的错误帧
 *
 * 为什么单独成文件：这是本 Demo 唯一会花额度的端点，和 /health 的生命周期完全不同；
 * 真正的循环在 lib/flow/stream-chat.ts，这里只保证「顺序不能错」。
 *
 * 日志（§5.3.16）：调用函数 五条日志（handlePostChat 封装层）；
 *   校验挡下（400 / 503）单独写 info（校验拒绝）——不算调用，不套五条日志；
 *   真正发网络请求的 logger 调用全部在 lib/flow/stream-chat.ts。
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

    // ② 入参校验必须排在开流之前：一旦发了 200 + text/event-stream 头，
    //    就再也改不回 400 了，页面只会收到一条「成功但是空」的流
    const parsed = parseChatBody(ctx.request.body);
    if (!parsed.ok) {
      logger.info(
        "api.chat",
        "POST /api/chat 被入参校验挡掉",
        "为什么写这条日志：校验挡下没花模型额度也没走到「调用模型」，但客户端要知道「为什么是 400」。当前：body 不合法，回 400 JSON。",
        { reason: parsed.reason },
      );
      writeRawJson(ctx.res, 400, { error: `请求体不合法：${parsed.reason}` });
      return;
    }

    // ③ 没 Key 也在开流前挡掉，回 503 而不是空流。
    //    页面其实早就从 /health 知道 Key ❌ 并禁用了按钮，这里是服务端兜底
    if (!llm) {
      logger.info(
        "api.chat",
        "POST /api/chat 被无 Key 校验挡掉",
        "为什么写这条日志：服务端兜底；页面早就从 /health 看到 hasKey=false 已禁按钮，这里再挡一次防「绕过 UI 直接 curl」。当前：apps/.env 当前 LLM_PROVIDER 无 Key，回 503 JSON。",
        { llmProvider: null },
      );
      writeRawJson(ctx.res, 503, {
        error: "当前 LLM_PROVIDER 没有可用 Key：先在 apps/.env 配置后重启服务",
      });
      return;
    }

    // ④ 到这里才发 SSE 响应头，之后所有信息（含上游报错）都只能以帧的形式传
    const tHandlerStart = Date.now();
    logger.info(
      "api.chat",
      "调用函数开始：handlePostChat",
      "为什么写这条日志：路由只认这一层 stats 形状（frameCount / usage / failed），里面那次才是真发网络请求（看「调用模型开始：对话补全」）。当前：POST /api/chat 入参已校验通过，即将 openSseStream → streamChatToSse。",
      {
        入参: {
          messagePreview: parsed.message.slice(0, 50),
          messageLen: parsed.message.length,
          hasKey: true,
          llmProvider: llm.provider,
          llmModelA: llm.modelA,
        },
        __code: `const writer = openSseStream(ctx.res);\nconst stats = await streamChatToSse({ llm, message: parsed.message, writer });`,
      },
    );

    const writer = openSseStream(ctx.res);
    const stats = await streamChatToSse({ llm, message: parsed.message, writer });

    logger.info(
      "api.chat",
      "调用函数结束：handlePostChat",
      "为什么写这条日志：路由要把 stats 交给页面 stats 区；和 streamChatToSse 的「调用函数结束」互为对照，便于核对。当前：stats 已收齐（含 frameCount / usage 或 failed）。",
      {
        返回值: {
          frameCount: stats.frameCount,
          usage: stats.usage,
          failed: stats.failed,
        },
        耗时ms: Date.now() - tHandlerStart,
      },
    );

    console.log(
      `  POST /api/chat  帧数=${stats.frameCount}` +
        (stats.usage ? `  total_tokens=${stats.usage.total_tokens}` : "  usage=无") +
        (stats.failed ? `  上游失败=${stats.failed.message}` : ""),
    );
  });
}