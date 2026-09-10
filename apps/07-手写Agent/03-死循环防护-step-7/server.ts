/**
 * 职责：模块 07 · 03 · 死循环防护 · step-7 最小可观察 · Demo 入口（只做装配）。
 *
 * 教学锚点（step-7 「token budget 闸」最小闭环）：
 *   - 按钮：跑「token budget」→ POST /api/agent/token-budget → mock 模型每轮调不同 sku
 *   - 闸门 7：累计 tokenEstimate > tokenBudget → stoppedReason=token_budget
 *   - 数字面板：已跑轮数 / 累计 token 估算（tokenEstimate） / token 预算（tokenBudget） / 停下来的原因
 *   - step-7 走 §5.3.0 例外「纯协议形状演示」—— mock 模型，token 是 mock 估算
 *
 * 入口：cd apps && yarn app:07-03-loop-guard-step-7
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountTokenBudgetRoutes } from "./routes/token-budget.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());

mountHealthRoutes(router);
mountTokenBudgetRoutes(router);

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