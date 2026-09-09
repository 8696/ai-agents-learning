/**
 * 模块 00 · 01 · API Key / 计费 · Demo 入口（只做装配）。
 *
 * 职责：读 PORT → bodyParser → 挂 routes → serve(public) → listen + 启动日志。
 * 数据流：浏览器 → koa 中间件链 → routes/（薄）→ lib/flow（量一次调用）→ lib/billing（折价）→ JSON。
 *
 * 浏览器：
 *   GET /                 → public/index.html（总览：数据流 + 示例单价表）
 *   GET /pages/usage.html → 单次计费：usage 三字段分项
 *   GET /pages/compare.html → 长输入短输出 vs 短输入长输出 并排对照
 *
 * 入口：yarn app:00-01-api-key-billing-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountBillingRoutes } from "./routes/billing.js";
import { mountBillingCompareRoutes } from "./routes/billing-compare.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，不能调换） ──
// bodyParser 必须在 router 之前：否则 route 里 ctx.request.body 是 undefined，
// Zod 会把每一次正常请求都判成 400。
app.use(bodyParser());

// 每个 mountXxx 只往 router 上挂自己那组端点，彼此不知道对方存在
mountHealthRoutes(router);
mountBillingRoutes(router);
mountBillingCompareRoutes(router);

// router 必须在 serve 之前：否则静态中间件先把 /api/* 当文件找，直接 404
app.use(router.routes()).use(router.allowedMethods());

// serve 必须传绝对路径：相对路径按 process.cwd() 解析，
// 而 yarn 是在 apps/ 下启动的，会指到不存在的 apps/public
const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；单次计费（usage 三字段分项）+ 输入/输出对照（两张账单并排）", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
