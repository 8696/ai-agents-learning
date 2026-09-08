/**
 * 模块 04 · 02 · JSON Mode vs Structured Output · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → lib/flow → 协议 A openai。
 *
 * 浏览器：
 *   GET /                            → public/index.html（总览）
 *   GET /pages/json-mode.html        → 语法闸 json_object
 *   GET /pages/structured.html       → 语义闸 json_schema strict
 *   GET /pages/strict-rejected.html  → 坏 schema 看 API 400
 *
 * 入口：cd apps && yarn app:04-02-json-mode-vs-structured-output-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";

import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountJsonModeRoutes } from "./routes/json-mode.js";
import { mountStructuredOutputRoutes } from "./routes/structured-output.js";
import { mountStrictRejectedRoutes } from "./routes/strict-rejected.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
// bodyParser 必须在 router 之前：否则 route 里 ctx.request.body 是 undefined
app.use(bodyParser());

mountHealthRoutes(router);
mountJsonModeRoutes(router);
mountStructuredOutputRoutes(router);
mountStrictRejectedRoutes(router);

// router 必须在 serve 之前：否则静态中间件先把 /api/* 当文件去找，直接 404
app.use(router.routes()).use(router.allowedMethods());

// serve 必须传绝对路径：相对路径按 process.cwd() 解析，
// 而 yarn 脚本是在 apps/ 下启动的，会指向根本不存在的 apps/public
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.startup",
    "模块 04 · 02 JSON Mode vs Structured Output Demo 已启动（§5.3.8 分层拆分 · 仅协议 A）",
    "启动横幅（不属于「调用」按 §5.3.16 不套五件套；记录端口、Provider、Model、Key 状态、可用端点）：本条对照例外是模块 04 · 02——同一输入下两套闸（json_object 语法闸 vs json_schema strict 语义闸）的差异。",
    {
      port: PORT,
      bind: "127.0.0.1",
      protocol: "A (chat.completions · response_format)",
      provider: llm?.provider ?? null,
      model: llm?.modelA ?? null,
      hasKey: Boolean(llm?.apiKey),
      endpoints: {
        "GET  /": "总览",
        "GET  /pages/json-mode.html": "语法闸 json_object",
        "GET  /pages/structured.html": "语义闸 json_schema strict",
        "GET  /pages/strict-rejected.html": "坏 schema 看 API 400",
        "GET  /health": "{ ok, port, provider, model, hasKey }",
        "POST /api/json-mode": "Body: { prompt } → 语法闸返回 ModeCallResult",
        "POST /api/structured-output": "Body: { prompt } → 语义闸返回 ModeCallResult",
        "POST /api/strict-rejected": "无 body → 期望 400 / 实际 200（unexpectedSuccess）",
      },
    },
  );
  console.log(
    "──── 模块 04 · 02 JSON Mode vs Structured Output Demo（§5.3.8 分层拆分 · 仅协议 A）· 已启动 ────",
  );
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  总览         /`);
  console.log(`  JSON Mode    /pages/json-mode.html`);
  console.log(`  Structured   /pages/structured.html`);
  console.log(`  坏 schema    /pages/strict-rejected.html`);
  console.log(`  GET  /health`);
  console.log(`  POST /api/json-mode · /api/structured-output · /api/strict-rejected`);
  console.log(`  Ctrl+C 退出`);
});
