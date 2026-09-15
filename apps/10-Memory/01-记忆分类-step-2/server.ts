/**
 * 职责：装配 HTTP 服务。只挂中间件和路由，不写业务。
 * 数据流：bodyParser → routes → 静态 public → listen 127.0.0.1:PORT。
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountClassifyRoutes } from "./routes/classify.js";
import { mountFactsRoutes } from "./routes/facts.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountClassifyRoutes(router);
mountFactsRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "记忆分类第二步：分类 + 写入 + 重启验证。", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});