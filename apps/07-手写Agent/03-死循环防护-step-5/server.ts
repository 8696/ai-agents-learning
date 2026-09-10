/**
 * 职责：模块 07 · 03 · 死循环防护 · step-5 最小可观察 · Demo 入口（只做装配）。
 *
 * 教学锚点（step-5 「看清工具重试上限闸的效果」最小闭环）：
 *   - 按钮 A：跑「偶发失败」（POST /api/agent/with-retry）—— flakyRate=0.5，3 次重试；通常 2-3 次成功
 *   - 按钮 B：跑「100% 失败」（POST /api/agent/always-fail）—— 重试 3 次后降级，stoppedReason=tool_retry_cap
 *   - 数字面板：已跑轮数 / 工具调用次数 / 工具失败次数 / 重试成功次数 / stoppedReason
 *   - step-5 走 §5.3.0 默认调真模型
 *
 * 入口：cd apps && yarn app:07-03-loop-guard-step-5
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountWithRetryRoutes } from "./routes/with-retry.js";
import { mountAlwaysFailRoutes } from "./routes/always-fail.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());

mountHealthRoutes(router);
mountWithRetryRoutes(router);
mountAlwaysFailRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-5 最小可观察：工具重试上限 闸（变体 5 · 偶发失败 vs 100% 失败 · 真模型）", {
    url: "http://127.0.0.1:" + PORT + "/",
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});