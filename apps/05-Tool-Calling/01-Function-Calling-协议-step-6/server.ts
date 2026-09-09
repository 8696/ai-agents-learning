/**
 * 模块 05 · 01 · Function Calling 协议 · step-6 协议层数据形态 + 编造检测可观察 · Demo 入口。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa → routes/chat.ts → 真 LLM（协议 A）+ Registry execute + detectHallucination。
 *
 * step-6 vs step-2：路由骨架一致（两轮 LLM + execute + 回灌）；step-6 在路由层加 detectHallucination，
 *   把 reply 数字 vs tool_result 数字的差异自动列出；前端 #hallucination 把"编造"具象化。
 *
 * 浏览器：
 *   GET  /              → public/index.html
 *   GET  /health        → { ok, port, provider, model, hasKey, callsModel:true }
 *   GET  /api/tools     → Registry 元信息
 *   POST /api/chat      → 真调 LLM（两轮）+ 编造检测
 *
 * 日志（§5.3.16）：server.start 由顶层 logger 写文件 + console；业务代码每个可打点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:05-01-fc-protocol-step-6
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

app.use(bodyParser());

mountHealthRoutes(router);
mountChatRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-6 真调 LLM + 自动编造检测", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
