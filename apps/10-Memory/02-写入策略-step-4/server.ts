/**
 * 职责：装配 HTTP 服务。只挂中间件和路由，不写业务。
 * 数据流：bodyParser → routes → 静态 public → listen 127.0.0.1:PORT。
 *
 * 本步（step-4）在 step-3 之上挂了 mountFilterDimensionsRoutes 的 enableC 扩展
 * （接口路径 /api/filter-dimensions 不变，body 加 enableC 字段），
 * 保留 step-1 的 mountExtractRoutes + step-2 的 mountFilterRoutes 作前几步的对照基线。
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountExtractRoutes } from "./routes/extract.js";
import { mountFilterRoutes } from "./routes/filter.js";
import { mountFilterDimensionsRoutes } from "./routes/filter-dimensions.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountExtractRoutes(router);
mountFilterRoutes(router);
mountFilterDimensionsRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "写入策略第四步：在 step-3 内容维度 A / B 之上加内容维度 C「值不值得占存储」一道闸门，把关这一关 3 把语义判定刀做齐；维度开关默认都开，公开常识和随口感慨该走 RAG 不该进个人库。", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
