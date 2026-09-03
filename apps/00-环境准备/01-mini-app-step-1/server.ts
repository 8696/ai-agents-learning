/**
 * 模块 00 · mini-app 的 HTTP + SSE 入口（§5.3 koa + 浏览器内联 React）。
 *
 * 职责：只做装配 —— PORT、bodyParser、挂 routes、serve public、listen。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/ → lib/{http,sse,flow} → 上游模型
 *
 * 浏览器：
 *   GET  /                   public/index.html（总览：场景地图 + 环境自检）
 *   GET  /pages/chat.html    流式对话：逐字上屏 + Token 用量
 *   GET  /pages/frames.html  SSE 原始帧：一帧一卡片，看清协议字段
 * 接口：
 *   GET  /health             { ok, port, protocol, provider, model, hasKey }
 *   POST /api/chat           协议 A 流式，原样转发上游 chunk 为 SSE 帧
 *
 * 取消 / 限流 / 协议对照等进阶能力在 apps/02-LLM-API开发/ 各小节，不塞进本入口。
 *
 * 入口：yarn app:00-01-mini-app-step-1 → tsx server.ts
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

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行都不能调换） ──
// bodyParser 在 router 之前：否则 routes 里 ctx.request.body 是 undefined
app.use(bodyParser());

// 每个 mountXxx 只挂自己那一组端点，彼此不知道对方存在
mountHealthRoutes(router);
mountChatRoutes(router);

// router 在 serve 之前：否则静态中间件会先把 /api/chat 当文件找，直接 404
app.use(router.routes()).use(router.allowedMethods());

// serve 必须传绝对路径：相对路径按 process.cwd() 解析，
// 而 yarn 是在 apps/ 下启动的，会指向不存在的 apps/public
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log("──── 模块 00 · mini-app HTTP + SSE（§5.3.8 分层 · 仅协议 A）· 已启动 ────");
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  总览         /`);
  console.log(`  流式对话     /pages/chat.html`);
  console.log(`  原始帧       /pages/frames.html`);
  console.log(`  GET  /health`);
  console.log(`  POST /api/chat   Body: { "message": "你好" }`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});
