/**
 * 模块 07 · 01 · Agent Loop / ReAct · step-2 并行 Act · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → runAgentLoop → 真 LLM（协议 A）。
 *
 * 教学锚点（step-2 「变体 E 并行 Act」）：
 *   - 复制 step-1 全量代码 + Act 阶段从 `for (const call of toolCalls)` 串行 → `Promise.all` 并行
 *   - query 改成「请一次性把 4 条逾期购物待办都标完成」（明确要求模型一轮内并行）
 *   - 期望看到：第 1 圈 list_todos → 第 2 圈 assistant.tool_calls 长度 = 4（并行 Act）→
 *     Promise.all 4 个 complete_todo 同时执行 → 同一圈耗时 ≈ 最慢那个（不是相加）
 *   - 变体 E 与变体 D 的对照：变体 D 一圈一个；变体 E 一圈多个互不依赖
 *
 * 浏览器：
 *   GET  /              → public/index.html
 *   GET  /health        → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/agent-run → { query } → runAgentLoop → 返回 trajectory + 并行对照数据
 *
 * 日志（§5.3.16）：server.start 由本地 logger 写文件 + console；业务代码每个可打日志的点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:07-01-agent-loop-react-step-2
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountAgentRoutes } from "./routes/agent.js";
import { mountErrorDemoRoutes } from "./routes/error-demo.js";
import { mountTodosRoutes } from "./routes/todos.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountAgentRoutes(router);
mountTodosRoutes(router);
mountErrorDemoRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-2 教学点：Act 阶段 Promise.all 并行执行同一圈的 tool_calls（变体 E 一圈多个 Act）", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
