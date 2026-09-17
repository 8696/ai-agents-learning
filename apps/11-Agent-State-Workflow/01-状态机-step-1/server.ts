/**
 * 职责：装配层。只挂路由、静态页、端口，不写业务。
 * 数据流：bodyParser → routes → serve(public/) → listen。
 * 为什么单独成文件：yarn 入口必须是 server.ts；业务在 routes/ 和 lib/flow/。
 */
import { bodyParser } from "@koa/bodyparser";
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountCafeStartRoutes } from "./routes/cafe-start.js";
import { mountCafeStepRoutes } from "./routes/cafe-step.js";
import { mountFaqStartRoutes } from "./routes/faq-start.js";
import { mountFaqStepRoutes } from "./routes/faq-step.js";
import { mountParallelStartRoutes } from "./routes/parallel-start.js";
import { mountParallelStepRoutes } from "./routes/parallel-step.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";
import { mountHealthRoutes } from "./routes/health.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountFaqStartRoutes(router);
mountFaqStepRoutes(router);
mountCafeStartRoutes(router);
mountCafeStepRoutes(router);
mountParallelStartRoutes(router);
mountParallelStepRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}/`;
  logger.info(
    "server.start",
    "listening",
    "为什么写这条日志：服务起来的那一刻就要写文件日志。当前：step-1 七页共用这一口（线性 FAQ / 七个对象 / 条件路由 / 循环回边 / 非法转移 / 节点失败 / 并行汇合）。",
    { url },
  );
  console.log(url);
});
