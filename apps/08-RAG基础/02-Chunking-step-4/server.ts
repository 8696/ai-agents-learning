/**
 * 模块 08 · 02 · 切块（Chunking） · Demo 入口（只做装配）。
 *
 * 职责：读 PORT + 装 bodyParser + 挂 routes + serve public + listen，不写业务逻辑。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → lib/flow/chunk.ts。
 *
 * 本条不调 LLM：纯本地文本操作（§5.3.0 例外），callsModel: false，密钥缺也不挡主按钮。
 *
 * 浏览器：
 *   GET /                      → public/index.html（同页三栏：左 fixed / 中 structure / 右 faq）
 *   GET /health                → 环境元信息
 *   POST /api/chunk/fixed      → 固定长度切
 *   POST /api/chunk/structure  → 按结构切
 *   POST /api/chunk/faq        → FAQ 切
 *   GET  /api/demo-error       → 故意 5xx（第二类错误演示）
 *
 * 入口：cd apps && yarn app:08-02-chunking-step-1
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
import { mountDemoError } from "./routes/demo-error.js";
import { mountCompareQuality } from "./routes/compare-quality.js";
import { mountChunkPdf } from "./routes/chunk-pdf.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser({
  // PDF 上传走 base64 字符串，10 MB PDF → ~13 MB base64 → 默认 1 MB 不够
  jsonLimit: "20mb",
  formLimit: "20mb",
}));
mountHealth(router);
mountChunkFixed(router);
mountChunkStructure(router);
mountChunkFaq(router);
mountCompareQuality(router);
mountChunkPdf(router);
mountDemoError(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "切块 step-4：PDF 按页切；纯本地文本操作，不调 LLM", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "local",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});