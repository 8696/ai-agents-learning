/**
 * 模块 02 · 03 AbortController · Demo 入口（只做装配）。
 *
 * 职责：读 PORT + 装 bodyParser + 挂 routes + serve public + listen，不写任何业务逻辑。
 * 数据流：浏览器 → koa 中间件链（bodyParser → router → static）→ routes/* → lib/flow → 上游模型。
 *
 * 浏览器：
 *   GET /                         → public/index.html（总览 + 全局数据流）
 *   GET /pages/full.html          → 不取消，跑到底（基线）
 *   GET /pages/cancel.html        → 带 signal，收 N 帧后 abort；可立即取消
 *   GET /pages/no-signal.html     → 故意不传 signal，abort 不生效
 *   GET /components/*.js          → 共享 JSX（Babel 转译）
 *   GET /utils/*.js                → 共享无 JSX
 *
 * 入口：cd apps && yarn app:02-03-abort-controller-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { logLlmConfig } from "../../llm.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountFullRoutes } from "./routes/full.js";
import { mountCancelRoutes } from "./routes/cancel.js";
import { mountNoSignalRoutes } from "./routes/no-signal.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
// bodyParser 必须在 router 之前：否则 route 里 ctx.request.body 是 undefined，
// 入参闸门会把每个请求都判成 400。
app.use(bodyParser());

// 每个 mountXxx 只往 router 上挂自己那一组端点，彼此不知道对方存在
mountHealthRoutes(router);
mountFullRoutes(router);
mountCancelRoutes(router);
mountNoSignalRoutes(router);

// router 必须在 serve 之前：否则静态中间件先把 /api/* 当文件去找，直接 404
app.use(router.routes()).use(router.allowedMethods());

// serve 必须传绝对路径：相对路径按 process.cwd() 解析，
// 而 yarn 脚本是在 apps/ 下启动的，会指向根本不存在的 apps/public
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    "──── 模块 02 · 03 AbortController Demo（§5.3.8 分层拆分 · 仅协议 A）· 已启动 ────",
  );
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  总览         /`);
  console.log(`  流到底       /pages/full.html`);
  console.log(`  收 N 帧停    /pages/cancel.html`);
  console.log(`  忘传 signal  /pages/no-signal.html`);
  console.log(`  GET  /health`);
  console.log(`  POST /api/full · /api/cancel-after-frames · /api/no-signal-abort`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});
