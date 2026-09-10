/**
 * 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-4 短任务对照 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa → 四组各自请求（short/long × step-by-step / plan-and-execute）。
 *
 * 教学锚点（step-4 「短任务对照」增量）：
 *   - GET /api/step-by-step?task=short|long
 *   - GET /api/plan-and-execute?task=short|long
 *   - 前端至少：跑短对照（两次 fetch）、跑长对照（两次 fetch）、四组一起（四次 fetch）
 *   - 对照数字在浏览器算；服务端禁止一个 handler Promise.all 四条
 *
 * 入口：cd apps && yarn app:07-02-plan-vs-step-step-4
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

app.use(bodyParser());

mountHealthRoutes(router);
mountStepByStepRoutes(router);
mountPlanAndExecuteRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-4 短任务对照：四组各自请求，对照数字在浏览器算", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
