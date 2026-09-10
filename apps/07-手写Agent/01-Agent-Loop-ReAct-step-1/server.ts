/**
 * 模块 07 · 01 · Agent Loop / ReAct · step-1 最小可观察 · Demo 入口（只做装配）。
 *
 * 职责：PORT + bodyParser + 挂 routes + serve public + listen。不写业务。
 * 数据流：浏览器 → koa（bodyParser → router → static）→ routes/* → runAgentLoop → 真 LLM（协议 A）。
 *
 * 教学锚点（step-1 「看见 Loop 在转」最小闭环）：
 *   - 输入框写一句任务 → POST /api/agent-run { query }
 *   - 路由组装 [system, user] → runAgentLoop → 完整 trajectory 按圈展开在 #output
 *   - 服务端日志写每一圈的入参完整 messages / 返回值完整 / __code / 耗时 → 翻 logs/ 看得见
 *   - 期望至少 2 圈：第 1 圈 list_todos（变体 D 串行依赖起点） → 第 2~N 圈 complete_todo
 *   - 最后一圈 tool_calls 空 → 最终答案（变体 J） → stoppedReason = final_answer
 *
 * 浏览器：
 *   GET  /              → public/index.html
 *   GET  /health        → { ok, port, provider, model, hasKey, callsModel:true }
 *   POST /api/agent-run → { query } → runAgentLoop → 返回 { trajectory, finalAnswer, stoppedReason, rounds, finalMessages }
 *   POST /api/agent-force-error → 502（§5.3.2 #2 类 B 教学演示）
 *
 * 日志（§5.3.16）：server.start 由本地 logger 写文件 + console；业务代码每个可写日志的点都在 lib/ 与 routes/ 里。
 *
 * 入口：cd apps && yarn app:07-01-agent-loop-react-step-1
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
import { logger } from "./lib/logger.js";

const app = new Koa();
const router = new Router();

// ── 中间件顺序（§5.3.5 实测踩坑，三行不能换位置）──
app.use(bodyParser());

mountHealthRoutes(router);
mountAgentRoutes(router);
mountErrorDemoRoutes(router);

app.use(router.routes()).use(router.allowedMethods());

const publicDir = fileURLToPath(new URL("./public", import.meta.url));
app.use(serve(publicDir));

app.listen(PORT, "127.0.0.1", () => {
  logger.info("server.start", "listening", "服务起好了；step-1 最小可观察：跑一整轮 Loop 看到 trajectory 在转（变体 H 多圈 + D 串行依赖 + J 最终答案）", {
    url: `http://127.0.0.1:${PORT}/`,
    protocol: "A",
  });
  console.log(`  浏览器:    http://127.0.0.1:${PORT}/`);
  console.log(`  Ctrl+C 退出`);
});
