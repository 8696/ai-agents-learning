/**
 * 模块 05 · 04 · Tool Gateway · step-4 变体 4 Tool 抛错结构化（调 LLM 协议 B）· Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（ → router → static）→ routes/*。
 *
 * step-4 教学点（覆盖本条 04 Tool Gateway · 变体 4）：
 *   - **3 按钮场景演示**：10÷2（成功）、10÷0（业务错 · DIVIDE_BY_ZERO · retryable:true）、10÷\"abc\"（参数错 · INVALID_PARAM · retryable:true）
 *   - handler throw → registry try/catch 捕获 → 包成结构化 → 整轮 agent 不挂
 *   - **Round 2 模型看到错误 → 改输入重试**（完整 LLM 两轮 · 教学核心）
 *   - 协议 B：content blocks / tool_use.input 是对象 / 必填 max_tokens / 回灌用 role:\"user\" + tool_result blocks
 *   - 单 Tool（divide）；变体 1 / 2 / 3 在 step-1 / step-2 / step-3
 *
 * 浏览器：
 *   GET  /                    → public/index.html（3 按钮场景）
 *   GET  /health              → { ..., callsModel:true, tools:[divide] }
 *   POST /api/chat            → { input } → 调 LLM 协议 B + divide（抛错 → Round 2 改输入）
 *
 * 日志：server.start 由本地 logger 写文件 + console。
 *
 * 入口：cd apps && yarn app:05-04-tool-gateway-step-4
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountChatRoutes } from "./routes/chat.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountChatRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-4 变体 4 Tool 抛错结构化（调 LLM 协议 B · divide）", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "anthropic-messages",
    tools: ["divide"],
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});