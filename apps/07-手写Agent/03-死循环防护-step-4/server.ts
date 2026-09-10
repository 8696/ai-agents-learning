/**
 * 职责：模块 07 · 03 · 死循环防护 · step-4 最小可观察 · Demo 入口（只做装配）。
 *
 * 教学锚点（step-4 「用户取消闸（AbortController）」最小闭环）：
 *   - 按钮 A：启一个 run → POST /api/agent/run-with-cancel → 立刻返 runId + 202
 *   - 按钮 B：用户中途取消 → POST /api/cancel/:runId → AbortController.abort() → runLoop 检测到 abortSignal.aborted → break
 *   - 按钮 C：轮询结果 → GET /api/agent/run-status/:runId
 *   - 数字面板：stepCount / tokenEstimate / elapsedMs / stoppedReason / finalAnswer
 *   - step-4 走 §5.3.0 默认调真模型
 *
 * 入口：cd apps && yarn app:07-03-loop-guard-step-4
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountRunWithCancelRoutes } from "./routes/run-with-cancel.js";
import { mountRunStatusRoutes } from "./routes/run-status.js";
import { mountCancelRoutes } from "./routes/cancel.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑） ──
app.use(bodyParser());

mountHealthRoutes(router);
mountRunWithCancelRoutes(router);
mountRunStatusRoutes(router);
mountCancelRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-4 最小可观察：用户取消闸（AbortController · 变体 4 · 真模型）", {
    url: "http://127.0.0.1:" + PORT + "/",
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});