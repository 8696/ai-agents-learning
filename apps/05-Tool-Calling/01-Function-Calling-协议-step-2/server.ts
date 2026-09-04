/**
 * 模块 05 · 01 · Function Calling 协议 · step-2 真 LLM（协议 A）· Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → 真 LLM (协议 A) + Registry execute。
 *
 * step-2 vs step-1（[§5.3.14](../../AGENTS.md#5314-demo-子节拆分动态引导由浅入深新)）：
 *   step-1 是 sketch —— mock decideToolCalls + mock buildFinalReply；
 *   step-2 把 mock 换成真 LLM（openai.chat.completions），两轮调用：round-1 拿 tool_calls，round-2 拿 final_reply。
 *   请求/响应**全量**回给前端可视化 —— 你能在 #llm-protocol 看到协议层数据长什么样。
 *
 * 浏览器：
 *   GET  /              → public/index.html
 *   GET  /health        → { ok, port, provider, model, hasKey, callsModel:true }
 *   GET  /api/tools     → Registry 元信息
 *   POST /api/chat      → 真调 LLM（两轮）
 *
 * 日志（§5.3.16）：server.start 由顶层 logger 写文件 + console；业务代码每个可打点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:05-01-fc-protocol-step-2
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountChatRoutes } from "./routes/chat.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountChatRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了，记下端口与端点让 /health 能对照", {
    url: `http://127.0.0.1:${PORT}/`,
    endpoints: ["GET /", "GET /health", "GET /api/tools", "POST /api/chat"],
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
