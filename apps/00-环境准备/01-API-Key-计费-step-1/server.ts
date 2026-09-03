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
import { logLlmConfig } from "../../llm.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountBillingRoutes } from "./routes/billing.js";
import { mountBillingCompareRoutes } from "./routes/billing-compare.js";

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
  console.log("──── 模块 00 · 01 API Key / 计费 Demo（§5.3.8 分层拆分 · 仅协议 A）· 已启动 ────");
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log("  总览          /");
  console.log("  单次计费      /pages/usage.html");
  console.log("  输入/输出对照 /pages/compare.html");
  console.log("  GET  /health              → { ok, port, provider, model, hasKey, pricing }");
  console.log("  POST /api/billing         → 调 1 次模型，回 usage + 分项费用");
  console.log("  POST /api/billing-compare → 调 2 次模型，回并排对照 + 结论");
  logLlmConfig(llm);
  console.log("  Ctrl+C 退出");
});
