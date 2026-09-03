/**
 * 模块 02 · 01 · Streaming / SSE · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/ → lib/{http,sse,flow}
 *
 * 浏览器：
 *   GET  /                      public/index.html（总览：数据流 ASCII，不调模型）
 *   GET  /pages/simulated.html  模拟 SSE 逐帧
 *   GET  /pages/blocking.html   一次性对照 TTFT
 *   GET  /pages/real.html       真实模型原始帧 + 拼起来的正文
 * 接口：
 *   GET  /health                { ok, port, provider, model, hasKey }
 *   GET  /api/stream            模拟 SSE，每 200ms 一帧，结束 [DONE]
 *   GET  /api/blocking          攒齐同样总耗时再返回
 *   GET  /api/real              真实模型流式（默认 prompt）
 *   POST /api/real              真实模型流式（body.prompt）
 *
 * 入口：yarn app:02-01-streaming-sse-step-1 → tsx server.ts
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { logLlmConfig } from "../../llm.js";
import { BLOCKING_TOTAL_MS } from "./lib/flow/simulate.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountStreamRoutes } from "./routes/stream.js";
import { mountBlockingRoutes } from "./routes/blocking.js";
import { mountRealRoutes } from "./routes/real.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行都不能调换） ──
// bodyParser 在 router 之前：否则 POST /api/real 的 ctx.request.body 是 undefined
app.use(bodyParser());

// 每个 mountXxx 只挂自己那一组端点，彼此不知道对方存在
mountHealthRoutes(router);
mountStreamRoutes(router);
mountBlockingRoutes(router);
mountRealRoutes(router);

// router 在 serve 之前：否则静态中间件会先把 /api/* 当文件找，直接 404
app.use(router.routes()).use(router.allowedMethods());

// serve 必须传绝对路径：相对路径按 process.cwd() 解析，
// 而 yarn 是在 apps/ 下启动的，会指向不存在的 apps/public
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log("──── 模块 02 · 01 Streaming / SSE Demo（§5.3.8 分层 · 仅协议 A）· 已启动 ────");
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  总览         /`);
  console.log(`  模拟 SSE     /pages/simulated.html`);
  console.log(`  一次性对照   /pages/blocking.html`);
  console.log(`  真实模型     /pages/real.html`);
  console.log(`  GET  /health`);
  console.log(`  GET  /api/stream    → 模拟 SSE（每 200ms 一帧）`);
  console.log(`  GET  /api/blocking  → 一次性（攒齐 ${BLOCKING_TOTAL_MS}ms）`);
  console.log(`  GET  /api/real      → 真实 LLM 流式（需 Key，默认 prompt）`);
  console.log(`  POST /api/real      → 真实 LLM 流式（需 Key，body.prompt）`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});
