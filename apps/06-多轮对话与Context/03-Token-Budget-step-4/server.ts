/**
 * 职责：模块 06 · 03 · Token Budget · step-4 · Demo 入口（只做装配）。
 *
 * 教学锚点（step-4 「选择性注入」最小可观察对照实验）：
 *   - 50 段多话题 history + 1 个 query → 关键词匹配 → 只把 top-N 命中段塞进 messages
 *   - 同 query 同模型同 history 走两条路径:全塞基线 vs 选择性注入
 *   - 2 次真调模型
 *
 * 浏览器：
 *   GET  /                          → public/index.html
 *   GET  /health                    → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/selective             → 全塞基线 + 选择性注入 对照
 *   POST /api/selective-force-error  → 教学演示 5xx 通道
 *
 * 入口：cd apps && yarn app:06-03-token-budget-step-4
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountSelectiveRoutes } from "./routes/selective.js";
import { mountErrorDemoRoutes } from "./routes/error-demo.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());

mountHealthRoutes(router);
mountSelectiveRoutes(router);
mountErrorDemoRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-4 选择性注入:50 段多话题 history + query 关键词匹配 → 只塞命中段", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
