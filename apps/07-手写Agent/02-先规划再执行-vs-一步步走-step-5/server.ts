/**
 * 模块 07 · 02 · 先规划再执行 vs 一步步走 · step-5 变体 E · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa → 左栏 GET /api/step-by-step、右栏 GET /api/plan-and-execute。
 *
 * 教学锚点：mock write_copy 第 1 次强制失败；shouldReplan 不看 ok=false → 标黄变体 E。
 *
 * 入口：cd apps && yarn app:07-02-plan-vs-step-step-5
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
  logger.info("server.start", "listening", "服务起好了；step-5 变体 E：write_copy 第 1 次强制失败，shouldReplan 不看 ok=false", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
