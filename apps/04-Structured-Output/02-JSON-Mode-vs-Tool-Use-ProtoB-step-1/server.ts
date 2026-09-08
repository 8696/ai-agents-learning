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

import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountTextRoutes } from "./routes/text.js";
import { mountToolUseRoutes } from "./routes/tool-use.js";
import { mountToolRejectedRoutes } from "./routes/tool-rejected.js";
import { logger } from "./lib/logger.js";

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
  logger.info(
    "server.startup",
    "模块 04 · 02 协议 B 版 · JSON Mode vs Tool-Use Demo 已启动（§5.3.8 分层拆分 · 仅协议 B）",
    "启动横幅（不属于「调用」按 §5.3.16 不套五件套；记录端口、Provider、Model、Key 状态、可用端点）：本条对照例外是模块 04 · 02 协议 B 版——协议 B 没有 response_format，所以对照例外：JSON Mode 等价路径（无 tools 纯文本）vs Structured Output 等价路径（强制 tool_choice）。",
    {
      port: PORT,
      bind: "127.0.0.1",
      protocol: "B (anthropic Messages)",
      provider: llm?.provider ?? null,
      model: llm?.modelB ?? null,
      hasKey: Boolean(llm?.apiKey),
      endpoints: {
        "GET  /": "总览",
        "GET  /pages/text.html": "无 tools 纯文本（类 JSON Mode）",
        "GET  /pages/tool-use.html": "强制 tool_choice（类 Structured Output）",
        "GET  /pages/tool-rejected.html": "prompt 诱导 enum 外字段，看守约",
        "GET  /health": "{ ok, port, provider, model, hasKey }",
        "POST /api/text": "Body: { prompt } → 无 tools 路径返回 ModeCallResult",
        "POST /api/tool-use": "Body: { prompt } → 强制 tool_choice 返回 ModeCallResult",
        "POST /api/tool-rejected": "无 body → 诱导守约返回 ToolRejectedResult",
      },
    },
  );
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
  console.log(`  Ctrl+C 退出`);
});
