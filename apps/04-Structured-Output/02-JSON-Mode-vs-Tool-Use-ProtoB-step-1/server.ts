/**
 * 模块 04 · 02 · 协议 B 版 · JSON Mode vs Tool-Use · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → lib/flow → 协议 B anthropic。
 *
 * 浏览器：
 *   GET /                         → public/index.html（总览）
 *   GET /pages/text.html          → 无 tools 纯文本（类 JSON Mode）
 *   GET /pages/tool-use.html      → 强制 tool_choice（类 Structured Output）
 *   GET /pages/tool-rejected.html → prompt 诱导 enum 外字段，看守约
 *
 * 入口：cd apps && yarn app:04-02-anthropic-tool-use-step-1
 * 本份是 §5.3.13 B 版分拆，禁止 import 协议 A 那一份。
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { logLlmConfig } from "../../llm.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountTextRoutes } from "./routes/text.js";
import { mountToolUseRoutes } from "./routes/tool-use.js";
import { mountToolRejectedRoutes } from "./routes/tool-rejected.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
// bodyParser 必须在 router 之前：否则 route 里 ctx.request.body 是 undefined
app.use(bodyParser());

mountHealthRoutes(router);
mountTextRoutes(router);
mountToolUseRoutes(router);
mountToolRejectedRoutes(router);

// router 必须在 serve 之前：否则静态中间件先把 /api/* 当文件去找，直接 404
app.use(router.routes()).use(router.allowedMethods());

// serve 必须传绝对路径：相对路径按 process.cwd() 解析，
// 而 yarn 脚本是在 apps/ 下启动的，会指向根本不存在的 apps/public
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    "──── 模块 04 · 02 协议 B 版 · JSON Mode vs Tool-Use Demo（§5.3.8 分层拆分 · 仅协议 B）· 已启动 ────",
  );
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  总览         /`);
  console.log(`  无 tools     /pages/text.html`);
  console.log(`  tool-use     /pages/tool-use.html`);
  console.log(`  诱导守约     /pages/tool-rejected.html`);
  console.log(`  GET  /health`);
  console.log(`  POST /api/text · /api/tool-use · /api/tool-rejected`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});
