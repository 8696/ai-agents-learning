/**
 * 模块 03 · 04 Prompt 版本管理 · Demo 入口（只做装配）。
 *
 * 职责：读 PORT + 装 bodyParser + 挂 routes + serve public + listen，不写任何业务逻辑。
 * 数据流：浏览器 → koa 中间件链（bodyParser → router → static）→ routes/* → lib/flow → 模型。
 *
 * 浏览器：
 *   GET /                      → public/index.html（总览）
 *   GET /pages/compare.html    → v1.0.0 vs v1.1.0 一字之差对照
 *
 * 入口：cd apps && yarn app:03-04-prompt-versioning-diff
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { logLlmConfig } from "../../llm.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountCompareRoutes } from "./routes/compare.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountCompareRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log("──── 模块 03 · 04 Prompt 版本管理 Demo（§5.3.8 分层拆分 · 仅协议 A）· 已启动 ────");
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  总览         /`);
  console.log(`  一字之差     /pages/compare.html`);
  console.log(`  GET  /health`);
  console.log(`  POST /api/compare`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});
