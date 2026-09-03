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
import { logLlmConfig } from "../../llm.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountARoutes } from "./routes/a.js";
import { mountBRoutes } from "./routes/b.js";
import { mountCompareRoutes } from "./routes/compare.js";
import { mountThinkCompareRoutes } from "./routes/think-compare.js";
import { mountAStreamRawRoutes } from "./routes/a-stream-raw.js";
import { mountBThinkingStreamRoutes } from "./routes/b-thinking-stream.js";
import { mountBStreamRawRoutes } from "./routes/b-stream-raw.js";

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
  console.log("──── 模块 02 · 协议 A vs B 对照 Demo（§5.3.8 分层 · 对照例外）· 已启动 ────");
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log("  总览          /");
  console.log("  一次性对照    /pages/once.html");
  console.log("  流式 A        /pages/stream-a.html");
  console.log("  流式 B        /pages/stream-b.html");
  console.log("  GET  /health");
  console.log("  POST /api/a · /api/b · /api/compare · /api/think-compare");
  console.log("  POST /api/a-stream-raw · /api/b-thinking-stream · /api/b-stream-raw");
  logLlmConfig(llm);
  console.log("  Ctrl+C 退出");
});
