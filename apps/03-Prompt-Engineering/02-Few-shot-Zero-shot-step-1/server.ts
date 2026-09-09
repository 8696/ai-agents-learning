/**
 * 模块 03 · 02 Few-shot / Zero-shot · Demo 入口（只做装配）。
 *
 * 职责：读 PORT + 装 bodyParser + 挂 routes + serve public + listen，不写任何业务逻辑。
 * 数据流：浏览器 → koa 中间件链（bodyParser → router → static）→ routes/* → lib/flow → 模型。
 *
 * 浏览器：
 *   GET /                      → public/index.html（总览 + 全局数据流）
 *   GET /pages/compare.html    → Zero vs Few 并排对照
 *   GET /components/*.js       → 共享 JSX（Babel 转译）
 *   GET /utils/*.js            → 共享无 JSX
 *
 * 入口：cd apps && yarn app:03-02-few-shot-zero-shot-step-1
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountClassifyRoutes } from "./routes/classify.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountClassifyRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；Zero（无样例）vs Few（4 对假对话），同一句评价 + 同一 System", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
