/**
 * 职责：模块 07 · 03 · 死循环防护 · step-6 最小可观察 · Demo 入口（只做装配）。
 *
 * 教学锚点（step-6 「同工具循环检测闸」最小闭环）：
 *   - 按钮：跑「同工具循环检测」→ POST /api/agent/loop-detection → mock 模型永远调 queryStock("SKU-LOOP")
 *   - 闸门 6：连续 N 次同工具同参数 → stoppedReason=tool_call_loop + summary.loopDetected=true
 *   - 数字面板：已跑轮数 / recentToolCalls 最近 N 步工具调用 / 停下来的原因
 *   - step-6 走 §5.3.0 例外「纯协议形状演示」—— mock 模型，演示同工具同参数能触发循环检测
 *
 * 入口：cd apps && yarn app:07-03-loop-guard-step-6
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountLoopDetectionRoutes } from "./routes/loop-detection.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());

mountHealthRoutes(router);
mountLoopDetectionRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-6 最小可观察：同工具循环检测 闸（变体 6 · mock 模型永远调同 sku）", {
    url: "http://127.0.0.1:" + PORT + "/",
    protocol: "local",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});