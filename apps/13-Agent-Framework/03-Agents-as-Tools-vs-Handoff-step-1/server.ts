/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不写图、不调模型。
 *
 * 数据流：解析 PORT → bodyParser → health / scenario / send-next / force-error → 静态 public/ → listen。
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger.js";
import { parseRuntimeCtx } from "./lib/http/runtime-ctx.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountScenarioRoutes } from "./routes/scenario.js";
import { mountSendNextRoutes } from "./routes/send-next.js";

const { PORT } = parseRuntimeCtx();
const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountScenarioRoutes(router);
mountSendNextRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "step-1 教学要点：两栏对照页（左 = 当工具调用，右 = 任务移交），同一句话进两个不同的对话；点「发送下一句」实时切当前 Agent / 追加消息到哪份 / 下一句判据。本 demo 不调大模型，本地 mock 两个 Agent 的话术循环。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "local",
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  Ctrl+C 退出");
});