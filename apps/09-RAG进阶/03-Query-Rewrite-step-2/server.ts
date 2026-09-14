/**
 * 职责：装配 koa：端口、bodyParser、各业务路由、静态页、listen。
 * 数据流：请求 → routes → lib/flow → JSON / public。
 * listen 回调里启动一次预嵌入（type=db），让首请求不卡。
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { PORT, llm } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { logLlmConfig } from "../../llm.js";
import { preEmbedChunks } from "./lib/store/vector-store.js";
import { mountCorpusRoutes } from "./routes/corpus.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountHydeAndSearchRoutes } from "./routes/hyde-and-search.js";
import { mountOriginalVectorSearchRoutes } from "./routes/original-vector-search.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountCorpusRoutes(router);
mountHydeAndSearchRoutes(router);
mountOriginalVectorSearchRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${PORT}/`);
  logLlmConfig(llm);
  logger.info(
    "server.start",
    "调用函数开始：listen",
    "为什么写这条日志：服务起那一刻就要写日志，烟雾测试只看 logs/ 当天文件。当前：step-2 HyDE 演示已监听。",
    { 入参: { PORT, hasKey: Boolean(llm) }, 返回值: { url: `http://127.0.0.1:${PORT}/` } },
  );

  // 启动后预嵌入 8 个切块一次（type=db）。失败不致命：日志告警 + 首请求再尝试。
  if (llm && llm.embeddingModel) {
    preEmbedChunks().catch(function (err) {
      logger.warn(
        "server.preEmbed",
        "预嵌入失败",
        "为什么写这条日志：首请求时再尝试嵌入也能用。失败提示用户去 /health 看 embeddingModel。",
        { 返回值: { error: err instanceof Error ? err.message : String(err) } },
      );
    });
  } else {
    logger.warn(
      "server.preEmbed",
      "跳过预嵌入（缺 Key / embeddingModel）",
      "为什么写这条日志：用户在页面会看到 503，告诉他去 .env 配置。",
      { 入参: { hasKey: Boolean(llm), hasEmbeddingModel: Boolean(llm?.embeddingModel) } },
    );
  }
});