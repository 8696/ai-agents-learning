/**
 * 模块 06 · 02 · 压缩 / 摘要 vs 滑动窗口 · step-3 双策略并跑 · 三方对照 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 *
 * 教学锚点（step-3 「同份对话三种裁剪一眼对照」）：
 *   - 一次跑 4 次真调模型（完整 + 滑动窗口 + 摘要 LLM + 摘要后问答）
 *   - 三方对照：① 完整 ② 滑动窗口（按条数 K + system pin） ③ 摘要压缩（远期 N → summary + 近 K 原文）
 *   - 一页 4 张卡对照；最直观的「丢字面 vs 留语义」可观察证据
 *
 * 浏览器：
 *   GET  /                       → public/index.html
 *   GET  /health                 → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/three-way          → 跑三方对照：调真模型 4 次 + 返回 { full, sliding, summarize }
 *   POST /api/three-way-force-error → 教学演示 5xx 通道
 *
 * 入口：cd apps && yarn app:06-02-compress-vs-window-step-3
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountThreeWayRoutes } from "./routes/three-way.js";
import { mountErrorDemoRoutes } from "./routes/error-demo.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());

mountHealthRoutes(router);
mountThreeWayRoutes(router);
mountErrorDemoRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-3 三方对照：一次跑 4 次真调模型（完整 + 滑动窗口 + 摘要 + 摘要后问答）= 一页 4 张卡看见「丢字面 vs 留语义」", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
