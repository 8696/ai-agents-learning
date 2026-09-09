/**
 * 模块 02 · 协议 A vs B · Demo 入口（只做装配）。
 *
 * 职责：PORT、bodyParser、挂 routes、serve public、listen。
 * 数据流：浏览器 → routes（A/B 分文件）→ lib/protocol-a 或 protocol-b → 并排形状在 lib/compare。
 *
 * 浏览器：
 *   GET  /                         总览（字段映射 + 导航）
 *   GET  /pages/once.html          一次性对照
 *   GET  /pages/stream-a.html      协议 A 流式
 *   GET  /pages/stream-b.html      协议 B 有/无 thinking
 *
 * 入口：yarn app:02-02-protocol-ab-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountARoutes } from "./routes/a.js";
import { mountBRoutes } from "./routes/b.js";
import { mountCompareRoutes } from "./routes/compare.js";
import { mountThinkCompareRoutes } from "./routes/think-compare.js";
import { mountAStreamRawRoutes } from "./routes/a-stream-raw.js";
import { mountBThinkingStreamRoutes } from "./routes/b-thinking-stream.js";
import { mountBStreamRawRoutes } from "./routes/b-stream-raw.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountARoutes(router);
mountBRoutes(router);
mountCompareRoutes(router);
mountThinkCompareRoutes(router);
mountAStreamRawRoutes(router);
mountBThinkingStreamRoutes(router);
mountBStreamRawRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；同一份 body 喂两个 SDK，比字段差异（A / B 并排）", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A+B",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
