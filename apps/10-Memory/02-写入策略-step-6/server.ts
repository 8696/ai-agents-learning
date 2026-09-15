/**
 * 职责：装配 HTTP 服务。只挂中间件和路由，不写业务。
 * 数据流：bodyParser → routes → 静态 public → listen 127.0.0.1:PORT。
 *
 * 本步（step-6）在 step-5 之上加 mountConfirmRoutes（POST /api/confirm 处理人工确认），
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
import { mountConfirmRoutes } from "./routes/confirm.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountExtractRoutes(router);
mountFilterRoutes(router);
mountFilterDimensionsRoutes(router);
mountConfirmRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "写入策略第六步：在 step-5 五道闸门之上加人工确认（变体 3-D），按 confidence 把候选分高/中/低三档——高档自动通过、中档攒进「待确认」区让用户点记住/不用、低档已被 step-2 拦下。把把关这一关 5 把刀做齐。", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});