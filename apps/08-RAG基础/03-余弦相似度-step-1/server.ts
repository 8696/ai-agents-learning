/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不写业务打分。
 *
 * 数据流：bodyParser → routes → serve(public/) → listen 127.0.0.1:PORT
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountDemoErrorRoutes } from "./routes/demo-error.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountScoreCosineRoutes } from "./routes/score-cosine.js";
import { mountScoreDotRoutes } from "./routes/score-dot.js";
import { mountScoreEuclideanRoutes } from "./routes/score-euclidean.js";
import { mountScoreCrossModelRoutes } from "./routes/score-cross-model.js";
import { mountScoreThresholdRoutes } from "./routes/score-threshold.js";
import { mountScoreTopkRoutes } from "./routes/score-topk.js";
import { mountScoreNormalizeRoutes } from "./routes/score-normalize.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountScoreCosineRoutes(router);
mountScoreDotRoutes(router);
mountScoreEuclideanRoutes(router);
mountScoreTopkRoutes(router);
mountScoreThresholdRoutes(router);
mountScoreCrossModelRoutes(router);
mountScoreNormalizeRoutes(router);
mountDemoErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "step-1：六 mode 合并（raw / topk / threshold / cross-model / contrast / normalize）", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "local",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
});