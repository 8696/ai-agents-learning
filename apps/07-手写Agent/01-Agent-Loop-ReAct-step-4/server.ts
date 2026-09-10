/**
 * 模块 07 · 01 · Agent Loop / ReAct · step-4 用户取消 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → runAgentLoop → 真 LLM（协议 A）。
 *
 * 教学锚点（step-4 「变体 M 用户取消」）：
 *   - 复制 step-3 全量代码（已经会失败 Observe 后改参）
 *   - 改 POST /api/agent-run 为「立刻返 202 + runId · loop 异步跑」
 *   - 新增 GET /api/agent-run/:runId 轮询端点（800ms 一次）
 *   - 新增 POST /api/cancel/:runId 触发 AbortController.abort()
 *   - 前端「取消」按钮：状态机 ⏸ / 🔄 / 🚫，三态切换的 #status-pill
 *   - lib/flow/loop.ts 透传 signal 到 openai.chat.completions.create；while 起点检测 signal.aborted
 *     → break + stoppedReason="cancelled"；AbortError 区分于 502 上游失败
 *   - 关键点：取消的物理动作 = AbortController.abort()；**已发出的 tool handler 不感知**，
 *     让那一圈 Act 跑完（变体 M 妥协，对照 MD 例子 5 「知识库已发出则在轨迹写『用户取消』」）
 *
 * 浏览器：
 *   GET  /                          → public/index.html
 *   GET  /health                    → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/agent-run             → 202 + { runId, startedAt, query }（立刻返回，不等 loop）
 *   GET  /api/agent-run/:runId      → running 返 202；done/cancelled 返 200；error 返 502
 *   POST /api/cancel/:runId         → 200 + { cancelled, existed, wasRunning }（幂等）
 *   POST /api/agent-force-error     → 教学用 502 演示
 *   GET  /api/todos                 → 内存 todo 快照（让前端肉眼看见 Loop 在改什么）
 *
 * 日志（§5.3.16）：server.start 由本地 logger 写文件 + console；业务代码每个可打日志的点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:07-01-agent-loop-react-step-4
 */
import Koa from "koa";
import Router from "@koa/router";
import serve from "koa-static";
import { bodyParser } from "@koa/bodyparser";
import { fileURLToPath } from "node:url";
import { PORT } from "./lib/http/runtime-ctx.js";
import { mountHealthRoutes } from "./routes/health.js";
import { mountAgentRoutes } from "./routes/agent.js";
import { mountCancelRoutes } from "./routes/cancel.js";
import { mountErrorDemoRoutes } from "./routes/error-demo.js";
import { mountTodosRoutes } from "./routes/todos.js";
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountAgentRoutes(router);
mountCancelRoutes(router);
mountTodosRoutes(router);
mountErrorDemoRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-4 教学点：用户取消（变体 M · AbortController.abort() 让 LLM 调用立刻中断）", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
