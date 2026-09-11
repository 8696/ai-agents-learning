/**
 * 职责：装配 HTTP 服务。不写业务路由。
 * 数据流：load env → 挂 routes → 静态页 → listen。
 */
import koaBody from "koa-body";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "../../load-root-env.js";
import { getLlmOptional, logLlmConfig } from "../../llm.js";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountAsk } from "./routes/ask.js";
import { mountDemoError } from "./routes/demo-error.js";
import { mountHealth } from "./routes/health.js";
import { mountIngest } from "./routes/ingest.js";
import { mountIngestUpload } from "./routes/ingest-upload.js";
import { mountStore } from "./routes/store.js";
import { mountStoreSources } from "./routes/store-sources.js";

loadRootEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const app = new Koa();
const router = new Router();
mountHealth(router);
mountIngest(router);
mountIngestUpload(router);
mountAsk(router);
mountStore(router);
mountStoreSources(router);
mountDemoError(router);

app.use(
  koaBody({
    multipart: true,
    formidable: { maxFileSize: 10 * 1024 * 1024 },
  }),
);
app.use(router.routes());
app.use(router.allowedMethods());
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "RAG 流水线 step-5：PDF 按页段 + 命中卡片显示页码", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
  logLlmConfig(getLlmOptional());
});
