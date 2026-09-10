/**
 * 职责：模块 07 · 03 · 死循环防护 · step-3 最小可观察 · Demo 入口（只做装配）。
 *
 * 教学锚点（step-3 「看清三闸门叠加 + 模型主动停」最小闭环）：
 *   - 按钮 ①：max iterations 单闸（POST /api/agent/with-gate）—— mock
 *   - 按钮 ②：timeout 单闸（POST /api/agent/timeout-gate）—— mock
 *   - 按钮 ③：model_says_stop 单闸（POST /api/agent/model-stop-gate）—— 真模型
 *   - 按钮 ④：三闸叠加（POST /api/agent/triple-gate）—— 真模型 + max + timeout + model_stop
 *   - 数字面板：stepCount / tokenEstimate / elapsedMs / stoppedReason / finalAnswer
 *   - step-3 走 §5.3.0 默认调真模型（按钮 ③ + ④ 调真模型）
 *
 * 入口：cd apps && yarn app:07-03-loop-guard-step-3
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
import { mountModelStopGateRoutes } from "./routes/model-stop-gate.js";
import { mountTripleGateRoutes } from "./routes/triple-gate.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑） ──
app.use(bodyParser());

mountHealthRoutes(router);
mountWithGateRoutes(router);
mountTimeoutGateRoutes(router);
mountModelStopGateRoutes(router);
mountTripleGateRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-3 最小可观察：max iterations + timeout + model_says_stop 三闸门（按钮 ③ ④ 调真模型 · ①② mock）", {
    url: "http://127.0.0.1:" + PORT + "/",
    protocol: "A+B",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});