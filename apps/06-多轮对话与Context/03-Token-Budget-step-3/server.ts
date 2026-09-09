/**
 * 职责：模块 06 · 03 · Token Budget · step-3 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → 真 LLM（协议 A）。
 *
 * 教学锚点（step-3 「软阈值 + 硬阈值双层」最小可观察对照实验）：
 *   - 软阈值 = step-1 / step-2 的丢最旧 / 摘要;total ≤ hardLimit 走 soft 路径
 *   - 硬阈值应急 = total > hardLimit → 只保留 system + history 末轮 + 提示"请用一句话重述"
 *   - 真调模型:soft 1 次问答 / summarize 多 1 次摘要;emergency 1 次问答
 *
 * 浏览器：
 *   GET  /                  → public/index.html
 *   GET  /health            → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/emergency     → 软硬双层:按 beforeBudget.total 判定走哪条
 *   POST /api/emergency-force-error → 教学演示 5xx 通道
 *
 * 日志（§5.3.16）：server.start 由本地 logger 写文件 + console；业务代码每个可打点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:06-03-token-budget-step-3
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountEmergencyRoutes } from "./routes/emergency.js";
import { mountErrorDemoRoutes } from "./routes/error-demo.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountEmergencyRoutes(router);
mountErrorDemoRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-3 软硬双层：软阈值（trim/summarize）+ 硬阈值应急（只留 system + 末轮 + 提示重述）", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
