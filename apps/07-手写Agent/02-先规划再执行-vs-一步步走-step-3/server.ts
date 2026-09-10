/**
 * 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-3 加重规划 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa → 左栏 GET /api/step-by-step、右栏 GET /api/plan-and-execute（各跑各的）。
 *
 * 教学锚点（step-3 「重规划」增量）：
 *   - 左栏按钮 → GET /api/step-by-step；右栏按钮 → GET /api/plan-and-execute
 *   - B 路径执行每步后 shouldReplan；触发则再调规划器；plans[] + executeTrace.planVersion
 *   - MAX_PLAN_VERSIONS=3；新版本 observations 清零
 *
 * 浏览器：
 *   GET  /                     → public/index.html
 *   GET  /health               → { ok, port, provider, model, hasKey, callsModel:true }
 *   GET  /api/step-by-step     → 左栏轨迹
 *   GET  /api/plan-and-execute → 右栏 plans[] + 执行
 *
 * 入口：cd apps && yarn app:07-02-plan-vs-step-step-3
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
  logger.info("server.start", "listening", "服务起好了；step-3 加重规划：B 路径执行阶段检测关键变化 → 计划 v1→v2", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
