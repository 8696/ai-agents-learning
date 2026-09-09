/**
 * 模块 02 · 04 Rate-Limit · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen，不写业务、不跑 CLI。
 * 数据流：浏览器 → koa 中间件链 → routes/*（薄）→ lib/flow（套 retry）→ lib/mock 或真 LLM。
 *
 * 浏览器：
 *   GET /                  → public/index.html（总览：分类重试 ASCII）
 *   GET /pages/mock.html   → 五个 mock 场景
 *   GET /pages/real.html   → 真 API 单次 + burst
 *
 * 入口：yarn app:02-04-rate-limit-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountMockRoutes } from "./routes/mock.js";
import { mountRealRoutes } from "./routes/real.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，不能调换） ──
// bodyParser 必须在 router 前：否则 route 里 ctx.request.body 是 undefined
app.use(bodyParser());

mountHealthRoutes(router);
mountMockRoutes(router);
mountRealRoutes(router);

// router 必须在 serve 前：否则静态中间件会先把 /api/* 当文件找并返回 404
app.use(router.routes()).use(router.allowedMethods());

// serve 必须传绝对路径：相对路径按 process.cwd() 解析，
// 而 yarn 是在 apps/ 下启动的，会指向不存在的 apps/public
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；mock 五场景（分类重试）+ 真 API 单次 / 并发撞 429", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
