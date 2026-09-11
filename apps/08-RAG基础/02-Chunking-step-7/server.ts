/**
 * 模块 08 · 02 · 切块（Chunking） · step-7 · atomic 块保护 Demo 入口（只做装配）。
 *
 * 职责：读 PORT + 装 bodyParser + 挂 routes + serve public + listen，不写业务逻辑。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → lib/flow/chunk.ts + chunk-atomic.ts。
 *
 * 本条不调 LLM：纯本地文本操作（§5.3.0 例外），callsModel: false，密钥缺也不挡主按钮。
 *
 * 浏览器：
 *   GET /                          → public/index.html（atomic 三档对照）
 *   GET /health                    → 环境元信息
 *   POST /api/chunk/structure      → 按结构切（不开 atomic·演示表格被切 / 编号条款散开）
 *   POST /api/chunk/atomic         → 按结构切（开 atomic·表格 / 代码块 / 编号条款整块保留）
 *   POST /api/chunk/atomic-overflow → 开 atomic + 单 atomic 块超嵌入上限（演示兜底说明而非静默截断）
 *   POST /api/chunk/fixed          → 固定长度切（对比：永远把 atomic 也按 size 切开）
 *   POST /api/chunk/faq            → FAQ 切
 *   GET  /api/demo-error           → 故意 5xx（第二类错误演示）
 *
 * 入口：cd apps && yarn app:08-02-chunking-step-7
 */
import Koa from "koa";
import Router from "@koa/router";
import { bodyParser } from "@koa/bodyparser";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountHealth } from "./routes/health.js";
import { mountChunkFixed } from "./routes/chunk-fixed.js";
import { mountChunkStructure } from "./routes/chunk-structure.js";
import { mountChunkFaq } from "./routes/chunk-faq.js";
import { mountChunkAtomic } from "./routes/chunk-atomic.js";
import { mountChunkAtomicOverflow } from "./routes/chunk-atomic-overflow.js";
import { mountDemoError } from "./routes/demo-error.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealth(router);
mountChunkFixed(router);
mountChunkStructure(router);
mountChunkFaq(router);
mountChunkAtomic(router);
mountChunkAtomicOverflow(router);
mountDemoError(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "切块 step-7：atomic 块保护（表格 / 代码块 / 编号条款整块保留）；纯本地文本操作，不调 LLM", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "local",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});