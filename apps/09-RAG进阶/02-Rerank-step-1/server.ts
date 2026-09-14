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
import { mountCorpus } from "./routes/corpus.js";
import { mountRecall } from "./routes/recall.js";
import { mountRerank } from "./routes/rerank.js";
import { mountForceError } from "./routes/force-error.js";
import { mountTokenEstimate } from "./routes/token-estimate.js";

loadRootEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const app = new Koa();
const router = new Router();
mountHealth(router);
mountCorpus(router);
mountRecall(router);
mountRerank(router);
mountForceError(router);
mountTokenEstimate(router);

app.use(bodyParser());
app.use(router.routes()).use(router.allowedMethods());
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "重排序 step-1：先看见服务端切块，再粗召回上桌，再精排改顺序",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "A",
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
  logLlmConfig(getLlmOptional());
});
