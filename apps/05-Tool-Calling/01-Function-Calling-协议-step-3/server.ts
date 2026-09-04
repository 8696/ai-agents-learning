/**
 * 模块 05 · 01 · Function Calling 协议 · step-3 并行调用 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → Registry (3 Tool · 全 async)。
 *
 * step-3 vs step-1/2（[§5.3.14](../../AGENTS.md#5314-demo-子节拆分动态引导由浅入深新)）：
 *   step-1/2 handler 同步 → Promise.all 也"瞬间完成"，看不出"并行"。
 *   step-3 把 handler 改 async（内含 `await sleep(30/50/80ms)` 模拟真实 IO），
 *   这样 Promise.all 才有"同时起步、各自结束"的物理意义，gantt 时序图能画出来。
 *   路由层 routes/plan.ts 暴露 mode=parallel|serial 两路，对比总耗时（MD 需求 2）。
 *
 * 浏览器：
 *   GET  /             → public/index.html
 *   GET  /health       → { ok, port, provider, model, hasKey, callsModel:false }
 *   GET  /api/tools    → Registry 元信息
 *   POST /api/plan     → { scenario, mode } 跑串/并行 → 返 totalMs + timeline
 *
 * 日志（§5.3.16）：server.start 由顶层 logger 写文件 + console；业务代码每个可打点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:05-01-fc-protocol-step-3
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountPlanRoutes } from "./routes/plan.js";
import { mountCompareRoutes } from "./routes/compare.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountPlanRoutes(router);     // pages/single.html → POST /api/plan（mode 切换 parallel|serial）
mountCompareRoutes(router);  // pages/compare.html → POST /api/compare（一次拿 parallel + serial 两份）

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-3 是 mock demo，不调 LLM；每个场景页 = 单独 route（§5.3.8 页与接口 1:1）", {
    url: `http://127.0.0.1:${PORT}/`,
    endpoints: [
      "GET /",
      "GET /health",
      "GET /api/tools",
      "POST /api/plan    ← pages/single.html",
      "POST /api/compare ← pages/compare.html",
    ],
    protocol: "mock",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
