/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不写业务 while / 不调模型。
 *
 * 数据流：解析 PORT → bodyParser → health / handwritten-loop / framework-loop / framework-chat → 静态 public/ → listen。
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { parseRuntimeCtx } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountAllergyGateRoutes } from "./routes/allergy-gate.js";
import { mountChatStreamRoutes } from "./routes/chat-stream.js";
import { mountFaqAgentRoutes } from "./routes/faq-agent.js";
import { mountFaqDirectRoutes } from "./routes/faq-direct.js";
import { mountFrameworkChatRoutes } from "./routes/framework-chat.js";
import { mountFrameworkLoopRoutes } from "./routes/framework-loop.js";
import { mountHandwrittenLoopRoutes } from "./routes/handwritten-loop.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountMultiDrinkParallelRoutes } from "./routes/multi-drink-parallel.js";
import { mountMultiDrinkSerialRoutes } from "./routes/multi-drink-serial.js";
import { mountNoLoopRoutes } from "./routes/no-loop.js";
import { mountRetryChargeRoutes } from "./routes/retry-charge.js";

const { PORT } = parseRuntimeCtx();
const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountHandwrittenLoopRoutes(router);
mountFrameworkLoopRoutes(router);
mountFrameworkChatRoutes(router);
mountChatStreamRoutes(router);
mountNoLoopRoutes(router);
mountFaqDirectRoutes(router);
mountFaqAgentRoutes(router);
mountMultiDrinkParallelRoutes(router);
mountMultiDrinkSerialRoutes(router);
mountRetryChargeRoutes(router);
mountAllergyGateRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "step-1：手写 while 出一杯拿铁；框架循环在另一页。", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  Ctrl+C 退出");
});
