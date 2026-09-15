/**
 * 职责：装配 HTTP 服务。只挂中间件和路由，不写业务。
 * 数据流：bodyParser → routes → 静态 public → listen 127.0.0.1:PORT。
 *
 * 本步（step-3）在 step-2 之上挂了 mountFilterDimensionsRoutes（/api/filter-dimensions），
 * 保留 step-1 的 mountExtractRoutes（/api/extract）+ step-2 的 mountFilterRoutes（/api/filter）
 * 作前几步的对照基线——学习者能直观看见「多加一道维度闸门切掉了什么」。
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
  logger.info("server.start", "listening", "写入策略第三步：在 step-2 置信度阈值之上加内容维度 A「是不是事实」+ 维度 B「跨会话还有用吗」两道闸门，按页面上开关决定每条候选在哪一道被拦下。", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
