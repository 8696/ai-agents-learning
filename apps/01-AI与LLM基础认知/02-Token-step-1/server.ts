/**
 * 模块 01 · 02 · Token · Demo 入口（只做装配）。
 *
 * 职责：读 PORT + 装 bodyParser + 挂 routes + serve public + listen，不写业务逻辑。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → lib/tokenize。
 *
 * 浏览器：
 *   GET /                     → public/index.html（总览）
 *   GET /pages/compare.html    → 中英对照
 *   GET /pages/encode.html     → 自定义文本
 *
 * 入口：cd apps && yarn app:01-02-token-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { logLlmConfig } from "../../llm.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountEncodeRoutes } from "./routes/encode.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountEncodeRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了，记下端口、端点、词表让 /health 能对照；本地 encode · 不调 LLM", {
    url: `http://127.0.0.1:${PORT}/`,
    endpoints: ["GET /", "GET /pages/compare.html", "GET /pages/encode.html", "GET /health", "POST /api/encode", "POST /api/compare"],
    vocab: "cl100k (gpt-tokenizer)",
    callsModel: false,
    provider: llm?.provider ?? null,
    model: llm?.modelA ?? null,
    hasKey: Boolean(llm),
  });
  console.log("──── 模块 01 · 02 Token Demo（本地 encode · 不调 LLM）· 已启动 ────");
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  总览         /`);
  console.log(`  中英对照     /pages/compare.html`);
  console.log(`  自定义文本   /pages/encode.html`);
  console.log(`  GET  /health`);
  console.log(`  POST /api/encode · /api/compare`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});
