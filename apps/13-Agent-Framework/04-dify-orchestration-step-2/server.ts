/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不写主流程、不调模型。
 *
 * 数据流：解析 PORT → bodyParser → health / conversation-vars / your-state / force-error → 静态 public/ → listen。
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger.js";
import { parseRuntimeCtx } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountConversationVarsRoutes } from "./routes/conversation-vars.js";
import { mountYourStateRoutes } from "./routes/your-state.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

const { PORT } = parseRuntimeCtx();
const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountConversationVarsRoutes(router);
mountYourStateRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "step-2 教学要点：两栏对照「跨轮的字段在哪」 —— 左栏会话变量（产品里的 sessionVars.cupSize，重启产品可能丢）+ 右栏你自己的 state（TypeScript OrderState.cupSize，commit 进仓库就在）。两轮对话：第一句「大杯热拿铁」→ 第二句「还是大杯，换成冰的」；第二轮两栏都拿到 cupSize=大杯，但持有方式不同。本 step 不调大模型（§5.3.0 例外「纯协议形状演示」）。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "local-mock",
      port: PORT,
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  Ctrl+C 退出");
});