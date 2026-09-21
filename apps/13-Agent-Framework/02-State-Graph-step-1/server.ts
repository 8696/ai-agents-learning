/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不写图、不调模型。
 *
 * 数据流：解析 PORT → bodyParser → health / linear-graph / force-error → 静态 public/ → listen。
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { parseRuntimeCtx } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountLinearGraphRoutes } from "./routes/linear-graph.js";

const { PORT } = parseRuntimeCtx();
const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountLinearGraphRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "step-1：线性状态图 START → takeOrder → brewHot → serve → END；页面摊开声明源代码再跑一遍。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "local",
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  Ctrl+C 退出");
});
