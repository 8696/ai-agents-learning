/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不写主流程、不调模型。
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger.js";
import { parseRuntimeCtx } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountCodeNodeWithOutputRoutes } from "./routes/code-node-with-output.js";
import { mountCodeNodeWithoutOutputRoutes } from "./routes/code-node-without-output.js";
import { mountGlobalEnvVsStateRoutes } from "./routes/global-env-vs-state.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

const { PORT } = parseRuntimeCtx();
const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountCodeNodeWithOutputRoutes(router);
mountCodeNodeWithoutOutputRoutes(router);
mountGlobalEnvVsStateRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "step-5 教学要点：两栏对照「代码节点 + 输出变量」—— 左栏写出 outputVars.price（下游能读到）；右栏忘了写（priceInCode 算成了但没暴露给 outputVars，下游读不到 price）。教学点：局部变量函数返回就丢；下游能不能读到 = 看有没有写到 outputVars。本 step 不调大模型（§5.3.0 例外）。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "local-mock",
      port: PORT,
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  Ctrl+C 退出");
});