/**
 * 职责：装配 koa：端口、bodyParser、各业务路由、静态页、listen。
 * 数据流：请求 → routes → lib/flow → JSON / public。
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { PORT, llm } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { logLlmConfig } from "../../llm.js";
import { mountAnchorAndSearchRoutes } from "./routes/anchor-and-search.js";
import { mountCorpusRoutes } from "./routes/corpus.js";
import { mountDriftAndSearchRoutes } from "./routes/drift-and-search.js";
import { mountDualExpansionRoutes } from "./routes/dual-expansion-and-search.js";
import { mountExpandAndSearchRoutes } from "./routes/expand-and-search.js";
import { mountFallbackAndSearchRoutes } from "./routes/fallback-and-search.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountResidualAndSearchRoutes } from "./routes/residual-and-search.js";
import { mountRewriteAndSearchRoutes } from "./routes/rewrite-and-search.js";
import { mountSearchOriginalRoutes } from "./routes/search-original.js";
import { mountSubquestionAndSearchRoutes } from "./routes/subquestion-and-search.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountCorpusRoutes(router);
mountSearchOriginalRoutes(router);
mountRewriteAndSearchRoutes(router);
mountExpandAndSearchRoutes(router);
mountAnchorAndSearchRoutes(router);
mountFallbackAndSearchRoutes(router);
mountDriftAndSearchRoutes(router);
mountResidualAndSearchRoutes(router);
mountSubquestionAndSearchRoutes(router);
mountDualExpansionRoutes(router);
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
    "为什么写这条日志：服务起那一刻就要写日志，烟雾测试只看 logs/ 当天文件。当前：step-1 查询改写演示已监听。",
    { 入参: { PORT, hasKey: Boolean(llm) }, 返回值: { url: `http://127.0.0.1:${PORT}/` } },
  );
});
