/**
 * 模块 03 · 01 · System / User / Assistant 优先级 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。
 * 业务：routes/（薄）→ protocol-a | protocol-b 发送，flow 只判定。
 *
 * 浏览器：
 *   GET /                         → 总览
 *   GET /pages/priority.html      → Case 1
 *   GET /pages/with-history.html  → Case 2
 *   GET /pages/no-history.html    → Case 3
 *
 * 入口：yarn app:03-01-system-user-assistant-priority-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { logLlmConfig } from "../../llm.js";
import { llm, PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountCase1Routes } from "./routes/case1-priority.js";
import { mountCase2Routes } from "./routes/case2-with-history.js";
import { mountCase3Routes } from "./routes/case3-no-history.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，不能调换） ──
app.use(bodyParser());

mountHealthRoutes(router);
mountCase1Routes(router);
mountCase2Routes(router);
mountCase3Routes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    "──── 模块 03 · 01 System / User / Assistant 优先级（§5.3.8 分层 · 对照例外）· 已启动 ────",
  );
  console.log(`  浏览器打开:  http://127.0.0.1:${PORT}/`);
  console.log("  总览          /");
  console.log("  Case 1        /pages/priority.html");
  console.log("  Case 2        /pages/with-history.html");
  console.log("  Case 3        /pages/no-history.html");
  console.log("  GET  /health");
  console.log("  POST /api/case1-priority · /api/case2-with-history · /api/case3-no-history");
  logLlmConfig(llm);
  console.log("  Ctrl+C 退出");
});
