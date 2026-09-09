/**
 * 模块 06 · 02 · 压缩 / 摘要 vs 滑动窗口 · step-5 按 token 算窗口 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → 真 LLM（协议 A）。
 *
 * 教学锚点（step-5 「按 token 算窗口 · 变体 2」）：
 *   - 滑动窗口 K 从「条数」换成「token 数」（用 gpt-tokenizer 估算）
 *   - 关键差别：单条超长消息（5000 token）按条数算只算 1 条，按 token 算会占大半预算
 *   - 摘要触发也从「条数阈值」换成「token 阈值」
 *   - 一页 4 张卡 + 「按 token vs 按条数」对照小结
 *
 * 浏览器：
 *   GET  /                       → public/index.html
 *   GET  /health                 → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/token-budget       → 跑按 token 算的对照
 *   POST /api/token-budget-force-error → 教学演示 5xx 通道
 *
 * 入口：cd apps && yarn app:06-02-compress-vs-window-step-5
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountTokenBudgetRoutes } from "./routes/token-budget.js";
import { mountErrorDemoRoutes } from "./routes/error-demo.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());

mountHealthRoutes(router);
mountTokenBudgetRoutes(router);
mountErrorDemoRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-5 按 token 算窗口：gpt-tokenizer 估每条 token + 滑动窗口 token 预算硬卡 + 摘要触发按 token 阈值 = 变体 2 的完整对照", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
