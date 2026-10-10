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
    "step-4 教学要点：进线第一句就分流（左栏 mode=entry-routing，从第一句起当前 Agent 就是退款专员；右栏 mode=handoff 普通对话：先总客服、再移交）。两者走同一段用户原话，但第一句回复者不同。本 demo 不调大模型，本地 mock 总客服 + 退款专员的话术循环。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "local",
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  Ctrl+C 退出");
});