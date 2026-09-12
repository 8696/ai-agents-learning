/**
 * 职责：本 demo 装配层 —— bodyParser → mountRoutes → serve(publicDir) → listen。
 * 业务（含 agent loop / 流式）一律写在 routes/ 与 lib/flow/；本文件不写 router.get/post。
 *
 * 数据流：启动 → 读 PORT → 装配路由 → listen → logger.info(server.start) + console 横幅。
 *
 * §5.3.5 强制：
 *   - bodyParser 在 router 前；router 在 serve 前
 *   - serve 第一个参数必须绝对路径（fileURLToPath 写死相对 server.ts 所在文件夹）
 *   - listen 回调里第一件事就是 logger.info("server.start", ...)
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { runtime } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountNoRagRoute } from "./routes/no-rag.js";
import { mountRagRoute } from "./routes/rag.js";
import { logger } from "./lib/logger.js";
import { logLlmConfig, getLlmOptional } from "../../llm.js";

const PORT = runtime.port;

const app = new Koa();
const router = new Router();

// §5.3.5 中间件顺序（实测踩坑）：bodyParser 必须在 router 前；router 必须在 serve 前
app.use(bodyParser());
mountHealthRoutes(router);
mountNoRagRoute(router);
mountRagRoute(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  const llm = getLlmOptional();
  // §5.3.16 server.start 标准：scope 锁死；msg 锁死；data.url + protocol；不写 endpoints
  logger.info(
    "server.start",
    "listening",
    "服务起好了；step-3 教学要点：同一道库里没有的题，左栏不接 RAG（model only · 无材料 · 无出处） vs 右栏检索增强生成 —— 看「凭空编一个（无依据） vs 弃权」的对照。本步没有训练任务。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "A",
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
  logLlmConfig(llm);
});