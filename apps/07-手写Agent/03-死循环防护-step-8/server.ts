/**
 * 职责：模块 07 · 03 · 死循环防护 · step-8 最小可观察 · Demo 入口（只做装配）。
 *
 * 教学锚点（step-8 「todo 助手端到端 + 业务选型面板」最小闭环）：
 *   - 业务选型面板：7 个 checkbox 控制 7 道闸的「装/不装」（最多必备 4 道 vs 7 道齐）
 *   - 单按钮：跑 todo 业务（真调模型）→ POST /api/agent/todo-assistant
 *   - 数字面板：已装闸数量 / 实际触发哪闸 / stepCount / tokenEstimate / finalAnswer
 *   - 端到端验证需求 6（todo 助手 · 7 道闸齐）
 *
 * 入口：cd apps && yarn app:07-03-loop-guard-step-8
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountTodoAssistantRoutes } from "./routes/todo-assistant.js";
import { mountTodoRunStatusRoutes } from "./routes/todo-run-status.js";
import { mountCancelRoutes } from "./routes/cancel.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

app.use(bodyParser());

mountHealthRoutes(router);
mountTodoAssistantRoutes(router);
mountTodoRunStatusRoutes(router);
mountCancelRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-8 最小可观察：todo 助手端到端 + 业务选型 7 闸面板（真调模型）", {
    url: "http://127.0.0.1:" + PORT + "/",
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});