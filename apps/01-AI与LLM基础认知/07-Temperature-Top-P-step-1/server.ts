/**
 * 模块 01 · 07 Temperature / Top-P · Demo 入口（只做装配）。
 *
 * 职责：读 PORT + 装 bodyParser + 挂 routes + serve public + listen，不写任何业务逻辑。
 * 数据流：浏览器 → koa 中间件链（bodyParser → router → static）→ routes/* → lib/flow → lib/sampling → 模型。
 *
 * 浏览器：
 *   GET /                      → public/index.html（总览 + 全局数据流）
 *   GET /pages/temperature.html→ 温度三档对照
 *   GET /pages/top-p.html      → Top-P 三档对照
 *   GET /pages/repeat.html     → 同一档参数重复 N 次看稳定性
 *   GET /components/*.js       → 共享 JSX（Babel 转译）
 *   GET /utils/*.js            → 共享无 JSX
 *
 * 入口：cd apps && yarn app:01-07-temperature-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountSweepRoutes } from "./routes/sweep.js";
import { mountRepeatRoutes } from "./routes/repeat.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
// bodyParser 必须在 router 之前：否则 route 里 ctx.request.body 是 undefined，
// 入参校验会把每个请求都判成 400。
app.use(bodyParser());

// 每个 mountXxx 只往 router 上挂自己那一组端点，彼此不知道对方存在
mountHealthRoutes(router);
mountSweepRoutes(router);
mountRepeatRoutes(router);

// router 必须在 serve 之前：否则静态中间件先把 /api/* 当文件去找，直接 404
app.use(router.routes()).use(router.allowedMethods());

// serve 必须传绝对路径：相对路径按 process.cwd() 解析，
// 而 yarn 脚本是在 apps/ 下启动的，会指向根本不存在的 apps/public
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；三档并发跑 N 次 = N × 3 次 LLM 调用，Key 缺失时端点一律 503", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
