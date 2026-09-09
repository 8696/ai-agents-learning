/**
 * 模块 06 · 01 · Context vs Memory · step-1 最小可观察 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → 真 LLM（协议 A）。
 *
 * 教学锚点（step-1 「看见 Context」最小闭环）：
 *   - 输入框发一条 user → 客户端把 [{role:'user', content}] 发到 /api/chat
 *   - 服务端把这份 messages 原样塞给模型；日志里看完整 messages + token 估算
 *   - 把助手回复合回 messages，下一次发送用新 messages 当入参（Context 在累积）
 *   - 「清空对话」按钮：演示 messages 清空 → 下次入参只剩新 user（Context 没了）
 *   - Memory 不在 step-1：刷新页面，messages 全没了（Context 跟一次会话绑定）
 *
 * 浏览器：
 *   GET  /              → public/index.html
 *   GET  /health        → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/chat      → { messages } → 真调 LLM + 返回 { reply, messages, totalTokens, promptTokens, completionTokens }
 *
 * 日志（§5.3.16）：server.start 由本地 logger 写文件 + console；业务代码每个可打点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:06-01-context-vs-memory-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountChatRoutes } from "./routes/chat.js";
import { mountErrorDemoRoutes } from "./routes/error-demo.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountChatRoutes(router);
mountErrorDemoRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-1 最小可观察：发一条消息就能看见 Context 的形状", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});