/**
 * 模块 05 · 02 · Tool Description · step-6 跨 Provider 兼容 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → 真 LLM（协议 A 或协议 B）。
 *
 * 教学锚点（变体 6「跨 Provider 兼容」）：
 *   - 同一份 Tool schema（step-5 B 组最佳 schema），分别走协议 A（OpenAI）和协议 B（Anthropic）
 *   - 两家 Provider 是否都能正确理解 schema、做出同样的 tool_call → 跨 Provider 可迁移的证据
 *   - 单 page + 双端点（/api/compare-baseline 走协议 A、/api/compare-improved 走协议 B）
 *
 * step-6 真调两家 LLM（OpenAI + Anthropic），用同一份 Tool schema。
 *
 * 浏览器：
 *   GET  /                      → public/index.html
 *   GET  /health                → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/compare-baseline  → 真调协议 A（OpenAI），返回 tool_call + 结果
 *   POST /api/compare-improved  → 真调协议 B（Anthropic），返回 tool_use + 结果
 *
 * 日志（§5.3.16）：server.start 由顶层 logger 写文件 + console；业务代码每个可写日志的点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:05-02-description-step-6
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
    protocol: "A+B",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
