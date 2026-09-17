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
import { mountHealthRoutes } from "./routes/health.js";
import { mountRunStartRoutes } from "./routes/run-start.js";
import { mountRunStepRoutes } from "./routes/run-step.js";
import { mountRunStepInMemoryRoutes } from "./routes/run-step-in-memory.js";
import { mountRunSecondRoutes } from "./routes/run-second.js";
import { mountRunNextRoutes } from "./routes/run-next.js";
import { mountRunShippingRefundStartRoutes } from "./routes/run-shipping-refund-start.js";
import { mountRunShippingRefundStepRoutes } from "./routes/run-shipping-refund-step.js";
import { mountRunForgetRoutes } from "./routes/run-forget.js";
import { mountRunResumeRoutes } from "./routes/run-resume.js";
import { mountMemoryGetRoutes } from "./routes/memory-get.js";
import { mountCheckpointGetRoutes } from "./routes/checkpoint-get.js";
import { mountCheckpointListRoutes } from "./routes/checkpoint-list.js";
import { mountRunChargeCrashRoutes } from "./routes/run-charge-crash.js";
import { mountPaymentGetRoutes } from "./routes/payment-get.js";
import { mountRunSerializeDirtyRoutes } from "./routes/run-serialize-dirty.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountRunStartRoutes(router);
mountRunStepRoutes(router);
mountRunStepInMemoryRoutes(router);
mountRunSecondRoutes(router);
mountRunNextRoutes(router);
mountRunShippingRefundStartRoutes(router);
mountRunShippingRefundStepRoutes(router);
mountRunForgetRoutes(router);
mountRunResumeRoutes(router);
mountMemoryGetRoutes(router);
mountCheckpointGetRoutes(router);
mountCheckpointListRoutes(router);
mountRunChargeCrashRoutes(router);
mountPaymentGetRoutes(router);
mountRunSerializeDirtyRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "服务起好了；step-2 三页一口：总览 + 终态开新业务 + 内存 vs 磁盘对照。step-1 那六页（端口 50121）不在这里复刻。",
    { url: `http://127.0.0.1:${PORT}/`, protocol: "local" },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
