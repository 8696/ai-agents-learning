/**
 * 职责：模块 07 · 03 · 死循环防护 · step-2 最小可观察 · Demo 入口（只做装配）。
 *
 * 教学锚点（step-2 「看清两道闸门叠加的效果」最小闭环）：
 *   - 按钮 A：跑 max iterations 单闸（POST /api/agent/with-gate）—— 看 stopReason=max_steps
 *   - 按钮 B：跑 timeout 单闸（POST /api/agent/timeout-gate）—— 看 stopReason=timeout + elapsedMs
 *   - 按钮 C：跑 max iterations + timeout 双闸（POST /api/agent/dual-gate）—— 看谁先到谁说了算
 *   - 数字面板：stepCount / tokenEstimate / stoppedReason / elapsedMs / gateTriggered
 *   - step-2 走 §5.3.0 例外「纯协议形状 / UI 渲染层演示」—— 不调真 LLM
 *
 * 浏览器：
 *   GET  /                     → public/index.html
 *   GET  /health               → { ok, port, provider, model, hasKey, callsModel:false }
 *   POST /api/agent/with-gate    → max iterations 单闸
 *   POST /api/agent/timeout-gate → timeout 单闸
 *   POST /api/agent/dual-gate    → 双闸叠加
 *
 * 入口：cd apps && yarn app:07-03-loop-guard-step-2
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountWithGateRoutes } from "./routes/with-gate.js";
import { mountTimeoutGateRoutes } from "./routes/timeout-gate.js";
import { mountDualGateRoutes } from "./routes/dual-gate.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑） ──
app.use(bodyParser());

mountHealthRoutes(router);
mountWithGateRoutes(router);
mountTimeoutGateRoutes(router);
mountDualGateRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-2 最小可观察：max iterations 单闸 vs timeout 单闸 vs 双闸叠加（mock 模型 + mock 工具 · 不调真 LLM）", {
    url: "http://127.0.0.1:" + PORT + "/",
    protocol: "local",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});