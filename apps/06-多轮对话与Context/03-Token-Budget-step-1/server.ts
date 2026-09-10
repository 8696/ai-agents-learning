/**
 * 职责：模块 06 · 03 · Token Budget · step-1 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → 真 LLM（协议 A）。
 *
 * 教学锚点（step-1 「Token Budget 三块分账 + 拼装前打印 + 超预算裁最旧」最小可观察对照实验）：
 *   - 算账：system 段 + history 段 + output 预留 三块预算分账
 *   - 拼装前打印：messages = [...] 之前先算 total token，超了再裁（不是发完 400 再补救）
 *   - 超预算触发：丢最旧非 system 消息（按 user/assistant 对丢），保留 output/system
 *   - 调真模型一次：拼装后的 messages → reply
 *
 * 浏览器：
 *   GET  /                  → public/index.html
 *   GET  /health            → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/budget        → 算预算 + 裁剪 + 调真模型 1 次 + 返回分账 + messages + reply
 *   POST /api/budget-force-error → 教学演示 5xx 通道
 *
 * 日志（§5.3.16）：server.start 由本地 logger 写文件 + console；业务代码每个可写日志的点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:06-03-token-budget-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountBudgetRoutes } from "./routes/budget.js";
import { mountErrorDemoRoutes } from "./routes/error-demo.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountBudgetRoutes(router);
mountErrorDemoRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-1 Token Budget 演示：三块预算分账 + 拼装前打印 + 超预算裁最旧", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
