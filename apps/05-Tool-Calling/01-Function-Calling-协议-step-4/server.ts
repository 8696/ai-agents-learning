/**
 * 模块 05 · 01 · Function Calling 协议 · step-4 串行依赖链 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/chain.ts → Registry (2 Tool · 链 A → B)。
 *
 * step-4 vs step-3（[§5.3.14](../../AGENTS.md#5314-demo-子节拆分动态引导由浅入深新)）：
 *   step-3 是「3 个独立 Tool 并发」(Promise.all)；本步是「2 个 Tool 串行依赖」(await chain)。
 *   handler 仍 async + sleep（让 gantt 时序图能画）；路由层 **不** 用 Promise.all —— B 需要 A 的输出当参数。
 *
 * 浏览器：
 *   GET  /                    → public/index.html
 *   GET  /health              → { ok, port, provider, model, hasKey, callsModel:false }
 *   GET  /api/tools           → Registry 元信息
 *   POST /api/chain           → { query, style } 跑 A→B 链 → 返 { steps, finalSummary, totalMs }
 *
 * 日志（§5.3.16）：server.start 由顶层 logger 写文件 + console；业务代码每个可打点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:05-01-fc-protocol-step-4
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountChainRoutes } from "./routes/chain.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountChainRoutes(router);  // pages/chain.html → POST /api/chain

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-4 是 mock demo，不调 LLM；演示串行依赖链 A → B（页与接口 1:1）", {
    url: `http://127.0.0.1:${PORT}/`,
    endpoints: [
      "GET /",
      "GET /health",
      "GET /api/tools",
      "POST /api/chain   ← pages/chain.html",
    ],
    protocol: "mock",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
