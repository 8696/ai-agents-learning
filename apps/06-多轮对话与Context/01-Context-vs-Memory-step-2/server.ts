/**
 * 模块 06 · 01 · Context vs Memory · step-2 Memory 持久化 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → 真 LLM（协议 A）+ SQLite（preferences.db）。
 *
 * 教学锚点（step-2 「Memory 跨会话还记」最小闭环）：
 *   - 输入框发一条 user → 客户端把 [{role:'user', content}] 发到 /api/chat
 *   - 服务端从 preferences.db 读偏好（O2 注入）→ 拼到 system 末尾 → 调真模型
 *   - 「记住偏好」按钮 → POST /api/memory → 写入 SQLite（O1 写入）；下次会话仍读得到
 *   - 「清空对话」按钮：只清前端 messages（Context 没了），Memory 不动（preferences.db 还在）
 *   - 关浏览器 / 刷新页面后再次发消息：模型仍按偏好回答 → 证明 Memory 真生效（区别于 step-1）
 *
 * 浏览器：
 *   GET  /              → public/index.html
 *   GET  /health        → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/chat      → { messages } → 真调 LLM（system 已注入 Memory 段） + 返回 { reply, messages, totalTokens, promptTokens, completionTokens }
 *   POST /api/memory    → { key, value } → 写入 preferences.db（O1）
 *   GET  /api/memory    → { preferences } → 列出已记住的偏好（O2 入口）
 *   DELETE /api/memory  → { key } → 删除某条偏好（O4；端点保留，UI step-3 再上「忘掉所有」按钮）
 *   POST /api/chat-force-error → 教学用 502 演示端点
 *
 * 日志（§5.3.16）：server.start 由本地 logger 写文件 + console；业务代码每个可打点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:06-01-context-vs-memory-step-2
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountChatRoutes } from "./routes/chat.js";
import { mountMemoryRoutes } from "./routes/memory.js";
import { mountErrorDemoRoutes } from "./routes/error-demo.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountChatRoutes(router);
mountMemoryRoutes(router);
mountErrorDemoRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-2 Memory 持久化：从 db 读偏好注入 system；写入通过 POST /api/memory", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});