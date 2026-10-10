/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不写 while、不调模型。
 *
 * 数据流：解析 PORT → bodyParser → health / handwritten-loop / agent-app / workflow / force-error → 静态 public/ → listen。
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { logger } from "./lib/logger.js";
import { parseRuntimeCtx } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountHandwrittenLoopRoutes } from "./routes/handwritten-loop.js";
import { mountAgentAppRoutes } from "./routes/agent-app.js";
import { mountWorkflowRoutes } from "./routes/workflow.js";
import { mountForceErrorRoutes } from "./routes/force-error.js";

const { PORT } = parseRuntimeCtx();
const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountHandwrittenLoopRoutes(router);
mountAgentAppRoutes(router);
mountWorkflowRoutes(router);
mountForceErrorRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info(
    "server.start",
    "listening",
    "step-1 教学要点：同一句「来一杯中杯热拿铁」三栏对照 —— 左栏手写循环（真调 LLM + 暴露 messages 数组），中栏智能体应用（同样的 while + 调 LLM，但 messages 数组藏了），右栏工作流画布（不调 LLM，节点 + 变量可见，调度器和类型不可见）。左 / 中两栏共用 lib/flow/handwritten-loop.ts 的 runLoop；右栏走 lib/flow/workflow.ts。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "openai-compatible",
      port: PORT,
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  Ctrl+C 退出");
});