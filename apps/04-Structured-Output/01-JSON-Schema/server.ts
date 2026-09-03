/**
 * 模块 04 · 01 · JSON Schema · Demo 入口（只做装配）。
 *
 * 职责：读 PORT + 装 bodyParser + 挂 routes + serve public + listen，不写业务逻辑。
 * 数据流：浏览器 → koa → routes/* → lib/schema/intent。
 *
 * 入口：cd apps && yarn app:04-01-json-schema
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { logLlmConfig } from "../../llm.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountParseRoutes } from "./routes/parse.js";
import { mountRepairRoutes } from "./routes/repair.js";
import { mountTransformRoutes } from "./routes/transform.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountParseRoutes(router);
mountRepairRoutes(router);
mountTransformRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log("──── 模块 04 · 01 JSON Schema Demo（Zod 本地 · 不调 LLM）· 已启动 ────");
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log(`  总览         /`);
  console.log(`  parse        /pages/parse.html`);
  console.log(`  repair       /pages/repair.html`);
  console.log(`  transform    /pages/transform.html`);
  console.log(`  GET  /health`);
  console.log(`  POST /api/parse · /api/repair · /api/transform`);
  logLlmConfig(llm);
  console.log(`  Ctrl+C 退出`);
});
