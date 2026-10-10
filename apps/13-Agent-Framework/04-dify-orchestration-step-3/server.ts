/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不写主流程、不调模型。
 *
 * 数据流：解析 PORT → bodyParser → health / loop-edge-without-counter / loop-edge-with-counter / force-error → 静态 public/ → listen。
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger.js";
import { parseRuntimeCtx } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountLoopEdgeWithoutCounterRoutes } from "./routes/loop-edge-without-counter.js";
import { mountLoopEdgeWithCounterRoutes } from "./routes/loop-edge-with-counter.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

const { PORT } = parseRuntimeCtx();
const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountLoopEdgeWithoutCounterRoutes(router);
mountLoopEdgeWithCounterRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "step-3 教学要点：两栏对照「回边的圈 + 你的次数变量」—— 左栏无次数变量（画了回边，但没自己写变量，库存永远缺 → 一圈一圈拉回 → 闸门触发）；右栏有次数变量（画了回边 + 自己写一个 counter 变量，每拉回一次 +1，到 counterLimit 退出）。教学点：画了圈不代表不让你手作圈；没有次数变量就一直转。本 step 不调大模型（§5.3.0 例外）。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "local-mock",
      port: PORT,
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  Ctrl+C 退出");
});