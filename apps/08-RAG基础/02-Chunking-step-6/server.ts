/**
 * 模块 08 · 02 · 切块（Chunking） · Demo 入口（只做装配）。
 *
 * 职责：读 PORT + 装 bodyParser + 挂 routes + serve public + listen，不写业务逻辑。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → lib/flow/chunk.ts。
 *
 * 本条不调 LLM：纯本地文本操作（§5.3.0 例外），callsModel: false，密钥缺也不挡主按钮。
 *
 * 浏览器：
 *   GET /              → public/index.html（综合对比表）
 *   GET /health        → 环境元信息
 *   GET /api/summary   → step-1 ~ step-5 各 demo 能力回顾（硬编码）
 *
 * 入口：cd apps && yarn app:08-02-chunking-step-6
 */
import Koa from "koa";
import Router from "@koa/router";
import { bodyParser } from "@koa/bodyparser";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountHealth } from "./routes/health.js";
import { mountSummary } from "./routes/summary.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealth(router);
mountSummary(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "切块 step-6：综合对比收尾 · step-1 ~ step-5 各 demo 能力回顾；纯本地展示，不调 LLM", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "local",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});