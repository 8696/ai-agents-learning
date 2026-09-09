/**
 * 模块 05 · 04 · Tool Gateway · step-3 变体 3 read_recent_emails 委托授权（调 LLM 协议 B）· Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/*。
 *
 * step-3 教学点（覆盖本条 04 Tool Gateway · 变体 3）：
 *   - **per-user OAuth + scope 限定**
**：每个用户 onboarding 时各走一次 OAuth 同意页 → 后端存 per-user refresh_token
 *   - **资源 = 该用户自己的**：alice token 只返 alice 邮件，bob token 只返 bob 邮件
 *   - **fail-closed**：actor.userId === "platform-god" → 立即 FORBIDDEN
 *   - **未 OAuth 拒绝**：actor.userId 不在 oauth_tokens 表里 → FORBIDDEN
 *   - 协议 B（Anthropic Messages API）：content blocks / tool_use.input 是对象 / 必填 max_tokens / 回灌用 role:"user"
 *   - 单 Tool（read_recent_emails）；变体 1 / 2 在 step-1 / step-2
 *
 * 浏览器：
 *   GET  /                    → public/index.html（单卡：变体 3 OAuth 演示）
 *   GET  /health              → { ..., callsModel:true, tools:[read_recent_emails], oauthUsers }
 *   POST /api/chat            → { input, actor } → 真调 LLM 协议 B + read_recent_emails OAuth 三步
 *
 * 日志（：server.start 由本地 logger 写文件 + console；业务代码每个可打点都在 lib/ 与 routes/。
 *
 * 入口：cd apps && yarn app:05-04-tool-gateway-step-3
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
  logger.info("server.start", "listening", "服务起好了；step-3 变体 3 OAuth（调 LLM 协议 B + read_recent_emails）", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "anthropic-messages",
    tools: ["read_recent_emails"],
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});