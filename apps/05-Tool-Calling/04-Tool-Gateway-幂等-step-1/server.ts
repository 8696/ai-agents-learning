/**
 * 模块 05 · 04 · Tool Gateway · step-1 真 LLM（协议 B · Anthropic Messages API）· Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/chat.ts → 真调 LLM 协议 B + Tool Gateway 三钩子。
 *
 * step-1 教学点（覆盖本条 04 Tool Gateway · 变体 1）：
 *   - **不是**"模型发出 tool_call 就执行"——Tool handler 内部**先走 Gateway 三钩子**，任一不过返 NEEDS_CONFIRM / FORBIDDEN / RATE_LIMITED
 *   - 鉴权（admin role）→ 配额（每月 5 次）→ 危险（confirm_token 二次确认）→ 全过才执行
 *   - 协议 B（Anthropic Messages API）：content 是 blocks 数组、tool_use.input 是对象、必填 max_tokens
 *
 * 浏览器：
 *   GET  /                    → public/index.html
 *   GET  /health              → { ok, port, provider, modelB, hasKey, callsModel:true, maxTokensB, tools, gatewayHooks }
 *   POST /api/chat            → { input, actor, confirmToken? } → 真调 LLM 协议 B + delete_user Gateway → 4 张数据卡 + 钩子判定链
 *
 * 日志（§5.3.16）：server.start 由本地 logger 写文件 + console；业务代码每个可打点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:05-04-tool-gateway-step-1
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

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountChatRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-1 真调 LLM 协议 B（Anthropic Messages API）+ Tool Gateway 三钩子", {
    url: `http://127.0.0.1:${PORT}/`,
    endpoints: [
      "GET /",
      "GET /health",
      "POST /api/chat            ← public/index.html（协议 B + Gateway）",
    ],
    protocol: "anthropic-messages",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});