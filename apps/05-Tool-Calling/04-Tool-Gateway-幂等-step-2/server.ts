/**
 * 模块 05 · 04 · Tool Gateway · step-2 变体 2 create_order 幂等（调 LLM 协议 B）· Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/*。
 *
 * step-2 教学点（覆盖本条 04 Tool Gateway · 变体 2）：
 *   - **create_order 幂等**：同 idempotency_key 连续 3 次 /api/chat → 模型发 create_order → 走幂等 cache + 内存 DB → DB 只插 1 行
 *   - 协议 B（Anthropic Messages API）字段层物理形态
 * - 单单单 Tool（create_order）；变体 1 / 3 在 step-1 / step-3
 *
 * 浏览器：
 *   GET  /                    → public/index.html（单卡：变体 2 幂等演示）
 *   GET  /health              → { ..., callsModel:true, tools:[create_order], orderStats }
 *   POST /api/chat            → { input, items, idempotency_key } → 真调 LLM 协议 B + create_order 幂等
 *
 * 日志（：server.start 由本地 logger 写文件 + console；业务代码每个可打点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:05-04-tool-gateway-step-2
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
  logger.info("server.start", "listening", "服务起好了；step-2 变体 2 幂等（调 LLM 协议 B · /api/chat 同 key 调 3 次 → DB 只插 1 行）", {
    url: `http://127.0.0.1:${PORT}/`,
    endpoints: [
      "GET /",
      "GET /health",
      "POST /api/chat            ← public/index.html（变体 2 · 模型发 create_order 幂等）",
    ],
    protocol: "anthropic-messages",
    tools: ["create_order"],
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});