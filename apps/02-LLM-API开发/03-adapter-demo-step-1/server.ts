/**
 * 模块 02 · Adapter 层 Demo 入口（只做装配）。
 *
 * 职责：PORT、bodyParser、挂 routes、serve public、listen。
 * 数据流：浏览器 → routes → lib/adapter（选协议）→ lib/protocol-a 或 protocol-b → Unified*。
 *
 * 浏览器：
 *   GET  /                      总览
 *   GET  /pages/once.html       一次性 sendMessage
 *   GET  /pages/stream.html     流式 sendMessageStream
 *
 * 入口：yarn app:02-03-adapter-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { logLlmConfig } from "../../llm.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountChatRoutes } from "./routes/chat.js";
import { mountChatStreamRoutes } from "./routes/chat-stream.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountChatRoutes(router);
mountChatStreamRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.startup",
    "模块 02 · Adapter Demo 已启动（§5.3.8 分层 · 对照例外）",
    "启动横幅（不属于「调用」按 §5.3.16 不套五件套；记录端口、Provider、Model、Key 状态、可用端点）：本条对照例外是模块 02 · Adapter——业务只调 sendMessage / sendMessageStream，不知道下面是 openai 还是 anthropic。",
    {
      port: PORT,
      bind: "127.0.0.1",
      protocol: "A (openai Chat Completions) + B (anthropic Messages) · 同形状 UnifiedResponse",
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm?.apiKey),
      endpoints: {
        "GET  /": "总览",
        "GET  /pages/once.html": "一次性 sendMessage",
        "GET  /pages/stream.html": "流式 sendMessageStream",
        "GET  /health": "{ ok, port, provider, model, hasKey, callsModel:true }",
        "POST /api/chat": "Body: SendMessageOptions → UnifiedResponse（adapter 选 A 或 B）",
        "POST /api/chat-stream": "Body: SendMessageOptions → SSE UnifiedDelta（adapter 选 A 或 B）",
      },
    },
  );
  console.log("──── 模块 02 · Adapter Demo（§5.3.8 分层 · 对照例外）· 已启动 ────");
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log("  总览          /");
  console.log("  一次性        /pages/once.html");
  console.log("  流式          /pages/stream.html");
  console.log("  POST /api/chat         → UnifiedResponse");
  console.log("  POST /api/chat-stream  → SSE UnifiedDelta");
  logLlmConfig(llm);
  console.log("  Ctrl+C 退出");
});
