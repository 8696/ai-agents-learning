/**
 * 职责：装配 HTTP 服务。不写业务路由。
 * 数据流：load env → 挂 routes → 静态页 → listen。
 */
import Koa from "koa";
import Router from "@koa/router";
import { bodyParser } from "@koa/bodyparser";
import serve from "koa-static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRootEnv } from "../../load-root-env.js";
import { getLlmOptional, logLlmConfig } from "../../llm.js";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountHealth } from "./routes/health.js";
import { mountSearchVector } from "./routes/search-vector.js";
import { mountSearchBm25 } from "./routes/search-bm25.js";
import { mountCorpus } from "./routes/corpus.js";
import { mountSearchHybrid } from "./routes/search-hybrid.js";

loadRootEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const app = new Koa();
const router = new Router();
mountHealth(router);
mountSearchVector(router);
mountSearchBm25(router);
mountCorpus(router);
mountSearchHybrid(router);

app.use(bodyParser());
app.use(router.routes()).use(router.allowedMethods());
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "BM25 / 混合检索 step-1：同一库、同一问句、向量与 BM25 分请求对照", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
  logLlmConfig(getLlmOptional());
});