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
import { PORT } from "./lib/http/runtime-ctx.js";
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
  logger.info("server.start", "listening", "服务起好了；adapter 选 A 或 B——业务只调 sendMessage / sendMessageStream 不知道下面是 openai 还是 anthropic", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A+B",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
