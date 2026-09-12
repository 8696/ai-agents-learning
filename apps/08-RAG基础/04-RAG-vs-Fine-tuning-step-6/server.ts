/**
 * 职责：本 demo 装配层 —— bodyParser → mountRoutes → serve(publicDir) → listen。
 *
 * 本步演示「该不该检索」的三种决策模式 —— 三个独立业务 URL：
 *   - POST /api/chat-routing    路由层规则（关键词判断）
 *   - POST /api/chat-threshold  命中阈值（top1 score > threshold）
 *   - POST /api/chat-agent      agent loop 风格（模型自己决定）
 *
 * §5.3.5 强制：bodyParser 在 router 前；router 在 serve 前
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { runtime } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountChatRoutingRoute } from "./routes/chat-routing.js";
import { mountChatThresholdRoute } from "./routes/chat-threshold.js";
import { mountChatAgentRoute } from "./routes/chat-agent.js";
import { logger } from "./lib/logger.js";
import { logLlmConfig, getLlmOptional } from "../../llm.js";

const PORT = runtime.port;

const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountChatRoutingRoute(router);
mountChatThresholdRoute(router);
mountChatAgentRoute(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  const llm = getLlmOptional();
  // §5.3.16 server.start 标准
  logger.info(
    "server.start",
    "listening",
    "服务起好了；step-6 教学要点：同一道题 → 三个 sub-page 演示「该不该检索」的三种流程 —— 路由层规则 / 命中阈值 / 模型自己决定（agent loop）。",
    {
      url: `http://127.0.0.1:${PORT}/`,
      protocol: "A",
    },
  );
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
  logLlmConfig(llm);
});