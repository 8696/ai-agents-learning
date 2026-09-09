/**
 * 模块 05 · 01 · Function Calling 协议 · step-7 混合编排（路由层 hard-code 约束 + 模型自决要不要进） · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/hybrid.ts → while 循环 + 路由层 hard-code 约束 + decideHybridAction mock。
 *
 * step-7 vs step-5（[§5.3.14](../../AGENTS.md#5314-demo-子节拆分动态引导由浅入深新)）：
 *   step-5 是 while + 模型自编排（每轮 decideNextAction 决定）；step-7 加两条路由层 hard-code 约束：
 *     ① 拒绝越权调用：suggest_items 必须在 get_weather 之后调，否则模型拿 ok:false error 反馈强制回到 weather
 *     ② 路径 B 硬接：用户问"带不带伞"时，模型调完 weather → final 时路由层**自动**再调 suggest_items（用 weather.rain_prob 当参数）
 *   模型仍然自决要不要进两步链（路径 A 仅 weather / 路径 B weather+hard-code suggest / 路径 C 直接打包 → 被拒 → 退回 weather → suggest）
 *
 * 浏览器：
 *   GET  /                    → public/index.html
 *   GET  /health              → { ok, port, provider, model, hasKey, callsModel:false }
 *   GET  /api/tools           → Registry 元信息
 *   POST /api/hybrid          → { query } → while 循环 + 路由层 hard-code → 返 { path, trace, finalReply, totalMs, rounds }
 *
 * 日志（§5.3.16）：server.start 由本地 logger 写文件 + console；业务代码每个可打点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:05-01-fc-protocol-step-7
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountHybridRoutes } from "./routes/hybrid.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountHybridRoutes(router);  // pages/hybrid.html → POST /api/hybrid

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-7 是 mock demo，不调 LLM；混合编排：路由层 hard-code 约束 + 模型自决要不要进（页与接口 1:1）", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "mock",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});