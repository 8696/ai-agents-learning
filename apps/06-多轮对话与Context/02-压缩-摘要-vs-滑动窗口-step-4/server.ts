/**
 * 模块 06 · 02 · 压缩 / 摘要 vs 滑动窗口 · step-4 失败兜底降级 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → 真 LLM（协议 A）。
 *
 * 教学锚点（step-4 「摘要失败不感知 · 自动降级到滑动窗口」）：
 *   - 默认：跑三方对照（同 step-3）+ 摘要失败模拟开关
 *   - 模拟摘要失败 → 自动降级到滑动窗口（不报错）+ 日志 warn「摘要失败，降级为滑动窗口」
 *   - 关键可观察：用户感知不到失败（页面正常响应）；返回字段 `fallback.used = true`
 *
 * 浏览器：
 *   GET  /                                  → public/index.html
 *   GET  /health                            → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/three-way-with-fallback       → 跑三方对照（含兜底）
 *   POST /api/three-way-force-error         → 教学演示 5xx 通道
 *
 * 入口：cd apps && yarn app:06-02-compress-vs-window-step-4
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountThreeWayWithFallbackRoutes } from "./routes/three-way-with-fallback.js";
import { mountErrorDemoRoutes } from "./routes/error-demo.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());

mountHealthRoutes(router);
mountThreeWayWithFallbackRoutes(router);
mountErrorDemoRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-4 失败兜底降级：摘要 LLM 失败 → 自动降级到滑动窗口（用户不感知）+ 日志 warn；这是「摘要压缩的真实代价」教学的最后一刀", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
