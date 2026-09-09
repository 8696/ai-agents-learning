/**
 * 模块 05 · 02 · Tool Description · step-1 真 LLM 对照实验 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → 真 LLM（协议 A，两次）。
 *
 * 教学锚点（变体 1「触发条件」）：
 *   - 用同一段 user query（如「我订单 12345 还没到，能查一下吗？」）分别发给「差描述」「好描述」两套 Tool
 *   - 模型的选择差异 = description 写得好不好的真实证据
 *   - 单 page + 单 route：避免 §5.3.8 「用 tab 切换」的反模式
 *
 * step-1 真调 LLM（学习者主动要的「真实调用大模型」）。
 *
 * 浏览器：
 *   GET  /              → public/index.html
 *   GET  /health        → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/compare   → 两次真调 LLM，返回两侧 tool_call + verdict
 *
 * 日志（§5.3.16）：server.start 由顶层 logger 写文件 + console；业务代码每个可打点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:05-02-description-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountCompareRoutes } from "./routes/compare.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountCompareRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了，记下端口与端点让 /health 能对照", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
