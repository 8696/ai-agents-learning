/**
 * 职责：模块 07 · 03 · 死循环防护 · step-1 最小可观察 · Demo 入口（只做装配）。
 *
 * 教学锚点（step-1 「看清 max iterations 闸门的效果」最小闭环）：
 *   - 按钮 A：跑反例（POST /api/agent/no-gate）—— 不装闸，硬跑到 200 步人为截停
 *   - 按钮 B：跑闸门（POST /api/agent/with-gate）—— MAX_STEPS 由 query 传入（默认 10）
 *   - 数字面板：stepCount / tokenEstimate / 哪道闸先触发 / stoppedReason
 *   - step-1 走 §5.3.0 例外「纯协议形状 / UI 渲染层演示」—— 不调真 LLM
 *
 * 浏览器：
 *   GET  /                     → public/index.html
 *   GET  /health               → { ok, port, provider, model, hasKey, callsModel:false }
 *   POST /api/agent/no-gate    → 反例轨迹
 *   POST /api/agent/with-gate  → 闸门版轨迹
 *
 * 入口：cd apps && yarn app:07-03-loop-guard-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountNoGateRoutes } from "./routes/no-gate.js";
import { mountWithGateRoutes } from "./routes/with-gate.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑） ──
app.use(bodyParser());

mountHealthRoutes(router);
mountNoGateRoutes(router);
mountWithGateRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-1 最小可观察：反例 vs max iterations 闸门（mock 模型 + mock 工具 · 不调真 LLM）", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "local",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});