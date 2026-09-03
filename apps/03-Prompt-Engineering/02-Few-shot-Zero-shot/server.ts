/**
 * 模块 03 · 02 Few-shot / Zero-shot · Demo 入口（只做装配）。
 *
 * 职责：读 PORT + 装 bodyParser + 挂 routes + serve public + listen，不写任何业务逻辑。
 * 数据流：浏览器 → koa 中间件链（bodyParser → router → static）→ routes/* → lib/flow → 模型。
 *
 * 浏览器：
 *   GET /                      → public/index.html（总览 + 全局数据流）
 *   GET /pages/compare.html    → Zero vs Few 并排对照
 *   GET /components/*.js       → 共享 JSX（Babel 转译）
 *   GET /utils/*.js            → 共享无 JSX
 *
 * 入口：cd apps && yarn app:03-02-few-shot-zero-shot
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { logLlmConfig } from "../../llm.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountClassifyRoutes } from "./routes/classify.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountClassifyRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log("──── 模块 03 · 02 Few-shot / Zero-shot Demo（§5.3.8 分层拆分 · 仅协议 A）· 已启动 ────");
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  总览         /`);
  console.log(`  并排对照     /pages/compare.html`);
  console.log(`  GET  /health`);
  console.log(`  POST /api/classify`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});
