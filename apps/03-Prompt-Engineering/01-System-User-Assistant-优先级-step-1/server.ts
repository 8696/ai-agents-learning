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
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountCase1Routes } from "./routes/case1-priority.js";
import { mountCase2Routes } from "./routes/case2-with-history.js";
import { mountCase3Routes } from "./routes/case3-no-history.js";
import { logger } from "./lib/logger.js";

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
  logger.info("server.start", "listening", "服务起好了；3 个 Case 用同一份 spec 分别送 A / B，看 SDK 行为差（System 字段位置、assistant 历史是否记）", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A+B",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
