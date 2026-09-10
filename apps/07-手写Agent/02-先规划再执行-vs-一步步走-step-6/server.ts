/**
 * 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-6 变体 F · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa → 左栏 GET /api/step-by-step；右栏 GET /api/plan → POST /api/confirm-plan。
 *
 * 教学锚点（变体 F 计划给人看）：
 *   - GET /api/plan 只规划、status=pending、不 invokeTool
 *   - POST /api/confirm-plan 只执行已保存的计划，禁止再跑 A 路径
 *   - 左栏和右栏确认互不绑定；UI 状态机 idle → planned → executed
 *
 * 入口：cd apps && yarn app:07-02-plan-vs-step-step-6
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountStepByStepRoutes } from "./routes/step-by-step.js";
import { mountPlanRoutes } from "./routes/plan.js";
import { mountConfirmPlanRoutes } from "./routes/confirm-plan.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());

mountHealthRoutes(router);
mountStepByStepRoutes(router);
mountPlanRoutes(router);
mountConfirmPlanRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-6 变体 F：GET /api/plan 只规划；POST /api/confirm-plan 才执行；确认前无副作用", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
