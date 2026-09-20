/**
 * 职责：装配 HTTP 服务。只挂路由和静态页，不写业务 while / 不调模型。
 *
 * 数据流：解析 PORT → bodyParser → health / basic-chat / reasoning-openai / reasoning-anthropic → 静态 public/ → listen。
 */
import { bodyParser } from "@koa/bodyparser";
import Router from "@koa/router";
import Koa from "koa";
import serve from "koa-static";
import { fileURLToPath } from "node:url";
import { parseRuntimeCtx } from "./lib/http/runtime-ctx.js";
import { logger } from "./lib/logger.js";
import { mountBasicChatRoutes } from "./routes/basic-chat.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountReasoningAnthropicRoutes } from "./routes/reasoning-anthropic.js";
import { mountReasoningOpenAiRoutes } from "./routes/reasoning-openai.js";

const { PORT } = parseRuntimeCtx();
const app = new Koa();
const router = new Router();

app.use(bodyParser());
mountHealthRoutes(router);
mountBasicChatRoutes(router);
mountReasoningOpenAiRoutes(router);
mountReasoningAnthropicRoutes(router);
app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "step-2：基础聊天 + 两种协议下的推理提取。", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log("  Ctrl+C 退出");
});