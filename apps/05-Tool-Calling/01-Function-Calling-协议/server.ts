/**
 * 模块 05 · 01 · Function Calling 协议 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。
 * 业务：routes/（薄）→ lib/flow|tools|schema|http（按职责分层）。
 *
 * 浏览器：
 *   GET /                    → public/index.html（总览）
 *   GET /pages/*.html        → 各教学场景
 *   GET /components/*.js     → 共享 JSX
 *   GET /utils/*.js          → 共享无 JSX
 *
 * 入口：yarn app:05-01-function-calling-protocol
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { logLlmConfig } from "../../llm.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import "./lib/tools/tool-defs.js";
import "./lib/tools/tool-defs-realistic.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountRunRoutes } from "./routes/run.js";
import { mountRunSerialRoutes } from "./routes/run-serial.js";
import { mountRunRealisticRoutes } from "./routes/run-realistic.js";
import { mountSimulateZodErrorRoutes } from "./routes/simulate-zod-error.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，不能调换） ──
// bodyParser 必须在 router 前：否则 route 里 ctx.request.body 是 undefined
app.use(bodyParser());

// 每个 mountXxx 只往 router 上挂自己那一组端点，互不知道对方存在
mountHealthRoutes(router);
mountRunRoutes(router);
mountRunSerialRoutes(router);
mountRunRealisticRoutes(router);
mountSimulateZodErrorRoutes(router);

// router 必须在 serve 前：否则静态中间件会先把 /api/* 当文件找并返回 404
app.use(router.routes()).use(router.allowedMethods());

// serve 必须传绝对路径：相对路径按 process.cwd() 解析，
// 而 yarn 是在 apps/ 下启动的，会指向不存在的 apps/public
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    "──── 模块 05 · 01 Function Calling 协议 Demo（§5.3.8 分层拆分 · 协议 A · 9 个 Tool）· 已启动 ────",
  );
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  总览         /`);
  console.log(`  单 / 并行    /pages/run.html`);
  console.log(`  串行依赖     /pages/serial.html`);
  console.log(`  差旅助手     /pages/realistic.html  ← 4-5 轮完整业务流（并行+串行混合）`);
  console.log(`  Zod repair   /pages/zod-error.html`);
  console.log(`  工具失败     /pages/tool-error.html`);
  console.log(`  GET  /health · GET /tools`);
  console.log(`  POST /api/run · /api/run-serial · /api/run-realistic · /api/simulate-zod-error`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});
