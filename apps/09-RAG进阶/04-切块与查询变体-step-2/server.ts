/**
 * 职责：装配 HTTP 服务。只挂中间件和路由，不写业务。
 * 数据流：bodyParser → routes → 静态 public → listen 127.0.0.1:PORT。
 * 启动后异步触发 buildIndex（建库）；失败只 warn，不阻塞 listen。
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountCorpusRoutes } from "./routes/corpus.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";
import { mountBuildIndexRoutes } from "./routes/build-index.js";
import { mountIndexStatusRoutes } from "./routes/index-status.js";
import { mountMultiQueryRoutes } from "./routes/multi-query.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountCorpusRoutes(router);
mountForceErrorRoutes(router);
mountBuildIndexRoutes(router);
mountIndexStatusRoutes(router);
mountMultiQueryRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "多路查询：模型生成 N 条不同说法的检索问句 → 各搜 → RRF 合并 → 同父去重 → 调对话补全。", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  向量库:    未建库（手动）—— 点页面上「建库」按钮才会调嵌入接口建库");
});