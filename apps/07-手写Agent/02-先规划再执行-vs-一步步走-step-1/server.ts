/**
 * 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-1 最小可观察 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa → 左栏 GET /api/step-by-step、右栏 GET /api/plan-and-execute（各跑各的）。
 *
 * 教学锚点（step-1 「看清两种节奏的形状差异」最小闭环）：
 *   - 左栏按钮 → GET /api/step-by-step；右栏按钮 → GET /api/plan-and-execute；「同时对照」浏览器并发两个请求
 *   - 左栏一步步走（变体 A）：每圈 Reason → Act → Observe；7 圈
 *   - 右栏先规划再执行（变体 B）：1 次规划（mock 6 步清单）+ 6 步执行
 *   - 对照数字在浏览器用两次返回值现场算，服务端不打包
 *   - step-1 走 §5.3.0 例外「纯协议形状 / UI 渲染层演示」—— 不调真 LLM
 *
 * 浏览器：
 *   GET  /                     → public/index.html
 *   GET  /health               → { ok, port, provider, model, hasKey, callsModel:false }
 *   GET  /api/step-by-step     → 左栏轨迹
 *   GET  /api/plan-and-execute → 右栏计划 + 执行
 *
 * 日志（§5.3.16）：server.start 由本地 logger 写文件 + console；业务日志在 lib/flow/ 与 routes/ 各侧自己的文件里。
 *
 * 入口：cd apps && yarn app:07-02-plan-vs-step-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountStepByStepRoutes } from "./routes/step-by-step.js";
import { mountPlanAndExecuteRoutes } from "./routes/plan-and-execute.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountStepByStepRoutes(router);
mountPlanAndExecuteRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-1 最小可观察：双栏对照「一步步走 vs 先规划再执行」（mock 模型 + mock 工具 · 不调真 LLM）", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "local",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
