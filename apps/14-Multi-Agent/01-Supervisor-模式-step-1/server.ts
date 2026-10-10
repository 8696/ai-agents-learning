/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不写 while、不调模型。
 *
 * 数据流：解析 PORT → bodyParser → health / supervisor / force-error → 静态 public/ → listen。
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger.js";
import { parseRuntimeCtx } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountSupervisorRoutes } from "./routes/supervisor.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

const { PORT } = parseRuntimeCtx();
const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountSupervisorRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "step-1 教学要点：一次派一个的 Supervisor 模式 + 共享状态 —— 一份 state（orderSlip / menuNotes / drinkType / cupLabel / pickupCall / guestReply）由客户端持有；每点一次「下一步」发一次 POST /api/step，服务端跑一轮「店长 LLM 选人 + 工人 LLM 写字段」，返回 newState + 这一轮轨迹；直到店长选 finish 写 guestReply。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "A",
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  Ctrl+C 退出");
});
