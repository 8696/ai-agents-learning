/**
 * 职责：本 demo 装配层 —— bodyParser → mountRoutes → serve(publicDir) → listen。
 * 业务一律写 routes/ 与 lib/；本文件不写 router.get/post。
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
import { fileURLToPath } from "node:url";
import { runtime } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountDataShapeRoute } from "./routes/data-shape.js";
import { mountDemoErrorRoute } from "./routes/demo-error.js";
import { logger } from "./lib/logger.js";
import { logLlmConfig, getLlmOptional } from "../../llm.js";

const PORT = runtime.port;

const app = new Koa();
const router = new Router();

// §5.3.5 中间件顺序：bodyParser 必须在 router 前；router 必须在 serve 前
mountHealthRoutes(router);
mountDataShapeRoute(router);
mountDemoErrorRoute(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  const llm = getLlmOptional();
  // §5.3.16 server.start 标准
  logger.info(
    "server.start",
    "listening",
    "服务起好了；step-4 教学要点：左栏文档段落（喂 RAG 用）vs 右栏问答对（喂微调用）—— 数据形态对照。本步不调 LLM（§5.3.0 例外「纯 UI 渲染层演示」）。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "local",  // 不调 LLM —— 本地展示
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
  logLlmConfig(llm);
});