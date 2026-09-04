/**
 * 模块 05 · 01 · Function Calling 协议 · step-5 模型自编排链 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/self-correct.ts → while 循环 + decideNextAction mock。
 *
 * step-5 vs step-4（[§5.3.14](../../AGENTS.md#5314-demo-子节拆分动态引导由浅入深新)）：
 *   step-4 路由层 hard-code A → B；本步是 while 循环 + 模型自编排。
 *   每轮由 decideNextAction (mock 函数) 决定下一步；MAX_ROUNDS 边界；自纠触发（空 hits → 换 query）。
 *
 * 浏览器：
 *   GET  /                    → public/index.html
 *   GET  /health              → { ok, port, provider, model, hasKey, callsModel:false }
 *   GET  /api/tools           → Registry 元信息
 *   POST /api/self-correct    → { query } → while 循环 → 返 { trace, totalMs, finalReply, rounds, maxRoundsTriggered }
 *
 * 日志（§5.3.16）：server.start 由顶层 logger 写文件 + console；业务代码每个可打点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:05-01-fc-protocol-step-5
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountSelfCorrectRoutes } from "./routes/self-correct.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountSelfCorrectRoutes(router);  // pages/self-correct.html → POST /api/self-correct

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-5 是 mock demo，不调 LLM；while 循环 + decideNextAction（页与接口 1:1）", {
    url: `http://127.0.0.1:${PORT}/`,
    endpoints: [
      "GET /",
      "GET /health",
      "GET /api/tools",
      "POST /api/self-correct   ← pages/self-correct.html",
    ],
    protocol: "mock",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
