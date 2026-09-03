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
