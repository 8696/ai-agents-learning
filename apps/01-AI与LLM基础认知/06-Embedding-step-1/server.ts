/**
 * 模块 01 · 06 · Embedding · Demo 入口（只做装配）。
 *
 * 职责：读 PORT + 装 bodyParser + 挂 routes + serve public + listen，不写业务逻辑。
 * 数据流：浏览器 → koa → routes/* → lib/vec。
 *
 * 入口：cd apps && yarn app:01-06-embedding-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { logLlmConfig } from "../../llm.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountRankRoutes } from "./routes/rank.js";
import { mountTokenIdRoutes } from "./routes/token-id.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountTokenIdRoutes(router);
mountRankRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log("──── 模块 01 · 06 Embedding Demo（玩具向量 · 不调 LLM）· 已启动 ────");
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  总览         /`);
  console.log(`  Token ID     /pages/token-id.html`);
  console.log(`  余弦排序     /pages/cosine.html`);
  console.log(`  GET  /health`);
  console.log(`  POST /api/token-id · /api/rank`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});
