/**
 * 职责：装配层 —— PORT / bodyParser / routes / static / listen。禁止在此写业务 router.get/post。
 * 数据流：mountHealth + mountChoice → serve public → http://127.0.0.1:PORT/
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountChoiceRoutes } from "./routes/choice.js";
import { mountHealthRoutes } from "./routes/health.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountChoiceRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-1 mock 路由 /api/choice（按 query 选 tool，不调 LLM）", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "mock",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
